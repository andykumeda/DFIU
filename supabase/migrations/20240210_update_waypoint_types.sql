-- Update waypoint type check constraint
ALTER TABLE waypoints DROP CONSTRAINT IF EXISTS waypoints_type_check;

ALTER TABLE waypoints 
ADD CONSTRAINT waypoints_type_check 
CHECK (type IN (
  'aid_station', 
  'water_only', 
  'crew', 
  'pacer', 
  'drop_bag', 
  'medical', 
  'landmark', 
  'start', 
  'finish'
));
