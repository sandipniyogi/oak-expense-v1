BEGIN;

UPDATE users
SET name = 'Sandip'
WHERE lower(name) IN ('tree', 'sandip');

UPDATE users
SET name = 'Vicky'
WHERE lower(name) IN ('partner a', 'vicky');

UPDATE users
SET name = 'Yolanda'
WHERE lower(name) IN ('partner b', 'yolanda');

COMMIT;
