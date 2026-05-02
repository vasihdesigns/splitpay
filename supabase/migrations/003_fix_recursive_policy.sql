-- Fix infinite recursion between expenses ↔ expense_splits RLS policies
--
-- Root cause:
--   expenses    SELECT policy → subquery on expense_splits
--   expense_splits SELECT policy → subquery on expenses
--   PostgreSQL detects the cycle and throws "infinite recursion detected"
--
-- Fix: remove the expense_splits subquery from the expenses policy.
--   expenses      can be seen if: paid_by = me  OR  in a group I belong to
--   expense_splits can be seen if: split belongs to me  OR  expense was paid by me / in my group
--   No cycle: expense_splits → expenses → group_members (stops here)

DROP POLICY IF EXISTS "Users can view relevant expenses" ON expenses;
CREATE POLICY "Users can view relevant expenses" ON expenses FOR SELECT
  USING (
    paid_by = auth.uid()
    OR group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
  );

-- expense_splits policy is fine as-is (queries expenses, which no longer queries back)
-- Recreate it cleanly just to be safe
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
