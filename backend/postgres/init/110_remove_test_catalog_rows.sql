-- Production cleanup: remove any catalog rows previously inserted by test/demo seeds.
-- Real catalog rows imported from the user's source data are untouched.
DELETE FROM rumbo_catalog_products
WHERE COALESCE((metadata->>'test_seed')::boolean, false) = true;
