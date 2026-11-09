-- WWT / CW grade for USED containers (trips + releases)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS used_grade text;
ALTER TABLE releases ADD COLUMN IF NOT EXISTS used_grade text;
