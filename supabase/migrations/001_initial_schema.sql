-- ─────────────────────────────────────────────────────────────────────────────
-- SplitPay — Initial Database Schema
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Profiles ────────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT NOT NULL,
  avatar_url  TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Friendships ─────────────────────────────────────────────────────────────
CREATE TABLE friendships (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (requester_id, addressee_id)
);

-- ─── Groups ──────────────────────────────────────────────────────────────────
CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('home', 'trip', 'couple', 'other')),
  created_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE group_members (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

-- ─── Expenses ────────────────────────────────────────────────────────────────
CREATE TABLE expenses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id     UUID REFERENCES groups(id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  amount       NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency     TEXT NOT NULL DEFAULT 'USD',
  category     TEXT NOT NULL DEFAULT 'other' CHECK (
    category IN ('food', 'transport', 'accommodation', 'entertainment', 'utilities', 'shopping', 'health', 'other')
  ),
  paid_by      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  split_type   TEXT NOT NULL DEFAULT 'equal' CHECK (split_type IN ('equal', 'exact', 'percentage', 'shares')),
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE expense_splits (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id  UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount      NUMERIC(12, 2) NOT NULL,
  paid        BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (expense_id, user_id)
);

-- ─── Settlements ─────────────────────────────────────────────────────────────
CREATE TABLE settlements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    UUID REFERENCES groups(id) ON DELETE SET NULL,
  payer_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payee_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency    TEXT NOT NULL DEFAULT 'USD',
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Activities ──────────────────────────────────────────────────────────────
CREATE TABLE activities (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type           TEXT NOT NULL CHECK (
    type IN ('expense_added', 'expense_edited', 'expense_deleted', 'settlement', 'member_added')
  ),
  actor_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id       UUID REFERENCES groups(id) ON DELETE CASCADE,
  expense_id     UUID REFERENCES expenses(id) ON DELETE CASCADE,
  settlement_id  UUID REFERENCES settlements(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships     ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits  ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities      ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, update own
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Groups: members can view their groups
CREATE POLICY "Members can view their groups" ON groups FOR SELECT
  USING (id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));
CREATE POLICY "Authenticated users can create groups" ON groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Group Members
CREATE POLICY "Members can view group members" ON group_members FOR SELECT
  USING (group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));
CREATE POLICY "Group creator can add members" ON group_members FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Expenses: group members can view
CREATE POLICY "Group members can view expenses" ON expenses FOR SELECT
  USING (group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));
CREATE POLICY "Group members can add expenses" ON expenses FOR INSERT
  WITH CHECK (group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));
CREATE POLICY "Expense creator can update" ON expenses FOR UPDATE
  USING (paid_by = auth.uid());
CREATE POLICY "Expense creator can delete" ON expenses FOR DELETE
  USING (paid_by = auth.uid());

-- Expense Splits
CREATE POLICY "View own splits" ON expense_splits FOR SELECT
  USING (user_id = auth.uid() OR expense_id IN (
    SELECT id FROM expenses WHERE group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
  ));
CREATE POLICY "Insert splits for group expenses" ON expense_splits FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Settlements
CREATE POLICY "View own settlements" ON settlements FOR SELECT
  USING (payer_id = auth.uid() OR payee_id = auth.uid());
CREATE POLICY "Create own settlements" ON settlements FOR INSERT
  WITH CHECK (payer_id = auth.uid());

-- Activities
CREATE POLICY "View own activities" ON activities FOR SELECT
  USING (actor_id = auth.uid() OR group_id IN (
    SELECT group_id FROM group_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Insert activities" ON activities FOR INSERT
  WITH CHECK (actor_id = auth.uid());

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_group_members_user    ON group_members(user_id);
CREATE INDEX idx_group_members_group   ON group_members(group_id);
CREATE INDEX idx_expenses_group        ON expenses(group_id);
CREATE INDEX idx_expenses_paid_by      ON expenses(paid_by);
CREATE INDEX idx_expense_splits_user   ON expense_splits(user_id);
CREATE INDEX idx_expense_splits_expense ON expense_splits(expense_id);
CREATE INDEX idx_activities_actor      ON activities(actor_id);
CREATE INDEX idx_activities_group      ON activities(group_id);
CREATE INDEX idx_friendships_requester ON friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id);
