-- Fix INSERT policy on expenses
-- Previous policy required paid_by = auth.uid(), which blocked recording
-- expenses where someone else paid (e.g. "Bob paid, split equally")
--
-- New policy: any authenticated user can insert an expense as long as
-- it's a non-group expense OR they are a member of the group.

DROP POLICY IF EXISTS "Authenticated users can add expenses" ON expenses;
CREATE POLICY "Authenticated users can add expenses" ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    group_id IS NULL
    OR group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );
