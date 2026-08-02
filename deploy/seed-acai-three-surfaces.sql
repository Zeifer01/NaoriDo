-- Three domain surfaces for Açaí House (worcesteracai.com)
-- Run on VPS after DNS A records for pedidos + app point to the server.
-- Idempotent: safe to re-run.

DO $$
DECLARE
  org_id uuid;
  now_ts timestamptz := now();
BEGIN
  SELECT id INTO org_id FROM organizations WHERE slug = 'acai-house' LIMIT 1;
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Organization acai-house not found';
  END IF;

  -- host_roles on org settings
  UPDATE organizations
  SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
    'host_roles', jsonb_build_object(
      'worcesteracai.com', 'landing',
      'www.worcesteracai.com', 'landing',
      'pedidos.worcesteracai.com', 'storefront',
      'app.worcesteracai.com', 'staff',
      'acai-house.automatizappy.com', 'staff'
    ),
    'menu_theme', COALESCE(settings->>'menu_theme', 'acai')
  )
  WHERE id = org_id;

  -- Ensure domains exist and are verified
  INSERT INTO organization_domains (id, organization_id, hostname, is_primary, verified_at, ssl_status, created_at)
  VALUES
    (gen_random_uuid(), org_id, 'worcesteracai.com', true, now_ts, 'active', now_ts),
    (gen_random_uuid(), org_id, 'www.worcesteracai.com', false, now_ts, 'active', now_ts),
    (gen_random_uuid(), org_id, 'pedidos.worcesteracai.com', false, now_ts, 'active', now_ts),
    (gen_random_uuid(), org_id, 'app.worcesteracai.com', false, now_ts, 'active', now_ts),
    (gen_random_uuid(), org_id, 'acai-house.automatizappy.com', false, now_ts, 'active', now_ts)
  ON CONFLICT (hostname) DO UPDATE
    SET
      organization_id = EXCLUDED.organization_id,
      verified_at = COALESCE(organization_domains.verified_at, EXCLUDED.verified_at),
      ssl_status = 'active';

  -- Primary = brand apex
  UPDATE organization_domains SET is_primary = false WHERE organization_id = org_id;
  UPDATE organization_domains SET is_primary = true
  WHERE organization_id = org_id AND hostname = 'worcesteracai.com';
END $$;
