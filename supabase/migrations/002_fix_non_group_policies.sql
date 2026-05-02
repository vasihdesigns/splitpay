-- Fix policies to support non-group (group_id IS NULL) expenses

-- 1. Expenses SELECT: allow viewing own expenses (paid_by) + group expenses + non-group splits
DROP POLICY IF EXISTS "Group members can view expenses" ON expenses;
CREATE POLICY "Users can view relevant expenses" ON expenses FOR SELECT
  USING (
    paid_by = auth.uid()
    OR group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
    OR id IN (SELECT expense_id FROM expense_splits WHERE user_id = auth.uid())
  );

-- 2. Expenses INSERT: already fixed in allow_non_group_expenses migration,
--    but add it here as a safety net in case that migration wasn't applied
DROP POLICY IF EXISTS "Authenticated users can add expenses" ON expenses;
CREATE POLICY "Authenticated users can add expenses" ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = paid_by
    AND (
      group_id IS NULL
      OR group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
    )
  );

-- 3. Expense splits SELECT: also allow viewing splits on non-group expenses you're involved in
DROP POLICY IF EXISTS "View own splits" ON expense_splits;
CREATE POLICY "View own splits" ON expense_splits FOR SELECT
  USING (
    user_id = auth.uid()
    OR expense_id IN (
      SELECT id FROM expenses
      WHERE paid_by = auth.uid()
         OR group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
    )
  );
