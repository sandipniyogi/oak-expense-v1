-- Existing projects are deliberately left without an owner.
-- Such projects must not be approved until ownership is explicitly reviewed.
ALTER TABLE oak_social_projects
  ADD COLUMN IF NOT EXISTS created_by_staff_id UUID REFERENCES oak_social_staff(id) ON DELETE SET NULL;
ALTER TABLE oak_social_projects
  ADD COLUMN IF NOT EXISTS last_edited_by_staff_id UUID REFERENCES oak_social_staff(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS oak_social_projects_creator_idx
  ON oak_social_projects(created_by_staff_id);
