-- Add days_to_complete and number_of_holidays columns to the tasks table
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS days_to_complete INTEGER,
ADD COLUMN IF NOT EXISTS number_of_holidays INTEGER;

-- Update existing tasks to calculate these values
-- For now, we'll set days_to_complete to the total days between start and end dates
-- and number_of_holidays to 0 as a default
UPDATE tasks
SET days_to_complete = (
  EXTRACT(DAY FROM (end_date::date - start_date::date)) + 1
),
number_of_holidays = 0
WHERE days_to_complete IS NULL OR number_of_holidays IS NULL;
