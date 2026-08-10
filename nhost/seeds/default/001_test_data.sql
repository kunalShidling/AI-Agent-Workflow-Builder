-- Insert Orgs
INSERT INTO organizations (id, name, calls_allowed) VALUES 
('11111111-1111-1111-1111-111111111111', 'Org A', 100),
('22222222-2222-2222-2222-222222222222', 'Org B', 100)
ON CONFLICT (id) DO NOTHING;

-- Note: We assume users will be inserted into nhost auth.users first, 
-- or we will create these users later. These inserts map roles for Org A and Org B.
-- Since this is a standalone seed, we might need to disable foreign key checks temporarily 
-- if auth.users is populated dynamically, but since nhost handles auth in another schema,
-- the foreign key to auth.users is not strictly enforced in our DDL script above (we just have UUID).

-- Org A Members
INSERT INTO org_members (org_id, user_id, role) VALUES 
('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'owner'),
('11111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'editor'),
('11111111-1111-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333', 'viewer')
ON CONFLICT (org_id, user_id) DO NOTHING;

-- Org B Members
INSERT INTO org_members (org_id, user_id, role) VALUES 
('22222222-2222-2222-2222-222222222222', 'b1111111-1111-1111-1111-111111111111', 'owner'),
('22222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'editor'),
('22222222-2222-2222-2222-222222222222', 'b3333333-3333-3333-3333-333333333333', 'viewer')
ON CONFLICT (org_id, user_id) DO NOTHING;
