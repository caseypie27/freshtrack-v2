CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  invite_code text NOT NULL UNIQUE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.household_members (
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);
GRANT SELECT ON public.households TO authenticated;
GRANT ALL ON public.households TO service_role;
GRANT SELECT ON public.household_members TO authenticated;
GRANT ALL ON public.household_members TO service_role;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.food_items ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE SET NULL;
ALTER TABLE public.food_items ADD COLUMN updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX food_items_household_idx ON public.food_items(household_id);

CREATE OR REPLACE FUNCTION public.my_household_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT household_id FROM public.household_members WHERE user_id = auth.uid()
$$;

CREATE POLICY "members read household" ON public.households FOR SELECT TO authenticated
  USING (id = public.my_household_id());
CREATE POLICY "members read members" ON public.household_members FOR SELECT TO authenticated
  USING (household_id = public.my_household_id());
CREATE POLICY "family items all" ON public.food_items FOR ALL TO authenticated
  USING (household_id IS NOT NULL AND household_id = public.my_household_id())
  WITH CHECK (household_id IS NOT NULL AND household_id = public.my_household_id());
CREATE POLICY "family profiles select" ON public.profiles FOR SELECT TO authenticated
  USING (id IN (SELECT user_id FROM public.household_members WHERE household_id = public.my_household_id()));

CREATE OR REPLACE FUNCTION public.gen_invite_code()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE c text; chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
BEGIN
  LOOP
    c := '';
    FOR i IN 1..6 LOOP c := c || substr(chars, 1 + floor(random()*length(chars))::int, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.households WHERE invite_code = c);
  END LOOP;
  RETURN c;
END $$;

CREATE OR REPLACE FUNCTION public.create_household(_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF EXISTS (SELECT 1 FROM household_members WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'You are already in a family'; END IF;
  INSERT INTO households(name, invite_code, owner_id) VALUES (trim(_name), gen_invite_code(), auth.uid()) RETURNING id INTO hid;
  INSERT INTO household_members(household_id, user_id, role) VALUES (hid, auth.uid(), 'owner');
  RETURN hid;
END $$;

CREATE OR REPLACE FUNCTION public.join_household(_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF EXISTS (SELECT 1 FROM household_members WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'You are already in a family'; END IF;
  SELECT id INTO hid FROM households WHERE invite_code = upper(trim(_code));
  IF hid IS NULL THEN RAISE EXCEPTION 'Invalid invite code'; END IF;
  INSERT INTO household_members(household_id, user_id, role) VALUES (hid, auth.uid(), 'member');
  RETURN hid;
END $$;

CREATE OR REPLACE FUNCTION public.leave_household()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hid uuid; r text; cnt int;
BEGIN
  SELECT household_id, role INTO hid, r FROM household_members WHERE user_id = auth.uid();
  IF hid IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO cnt FROM household_members WHERE household_id = hid;
  IF r = 'owner' AND cnt > 1 THEN RAISE EXCEPTION 'Transfer ownership before leaving'; END IF;
  -- move user's family items back to personal
  UPDATE food_items SET household_id = NULL WHERE household_id = hid AND user_id = auth.uid();
  DELETE FROM household_members WHERE user_id = auth.uid();
  IF cnt = 1 THEN DELETE FROM households WHERE id = hid; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.remove_household_member(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hid uuid;
BEGIN
  SELECT id INTO hid FROM households WHERE owner_id = auth.uid();
  IF hid IS NULL THEN RAISE EXCEPTION 'Only the owner can remove members'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot remove yourself'; END IF;
  UPDATE food_items SET household_id = NULL WHERE household_id = hid AND user_id = _user_id;
  DELETE FROM household_members WHERE household_id = hid AND user_id = _user_id;
END $$;

CREATE OR REPLACE FUNCTION public.regenerate_invite_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c text;
BEGIN
  c := gen_invite_code();
  UPDATE households SET invite_code = c WHERE owner_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the owner can do this'; END IF;
  RETURN c;
END $$;

CREATE OR REPLACE FUNCTION public.transfer_household_ownership(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hid uuid;
BEGIN
  SELECT id INTO hid FROM households WHERE owner_id = auth.uid();
  IF hid IS NULL THEN RAISE EXCEPTION 'Only the owner can transfer ownership'; END IF;
  IF NOT EXISTS (SELECT 1 FROM household_members WHERE household_id = hid AND user_id = _user_id) THEN RAISE EXCEPTION 'Not a member'; END IF;
  UPDATE households SET owner_id = _user_id WHERE id = hid;
  UPDATE household_members SET role = CASE WHEN user_id = _user_id THEN 'owner' ELSE 'member' END WHERE household_id = hid;
END $$;

CREATE OR REPLACE FUNCTION public.rename_household(_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE households SET name = trim(_name) WHERE owner_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the owner can rename'; END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.gen_invite_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_household(text), public.join_household(text), public.leave_household(),
  public.remove_household_member(uuid), public.regenerate_invite_code(), public.transfer_household_ownership(uuid),
  public.rename_household(text), public.my_household_id() TO authenticated;