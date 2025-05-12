#! /usr/bin/env bash

# Configuration
CONNECTION_STR=$1

if [ -z "$CONNECTION_STR" ]; then
  echo "Error: Pass connection string as $1"
  exit 1
fi

SCHEMA_NAME="openalex"
DATE=$(date '+%Y-%m-%d_%H:%M:%S')
LOG_FILE="vacuum_verbose_results_$DATE.log"

SKIP_TABLES=(
  "authors_ids"
  "institutions_ids"
  "sources_counts_by_year"
  "works_concepts"
  "works"
  "works_locations"
  "works_mesh"
  "works_primary_locations"
  "works_ids"
  "authors"
  "works_related_works"
  "batch"
  "works_batch"
  "works_open_access"
  "works_best_oa_locations"
  "authors_counts_by_year"
  "concepts_ids"
  "concepts"
)

echo "Starting VACUUM (VERBOSE, ANALYZE) on all tables in schema $SCHEMA_NAME at $DATE" | tee -a "$LOG_FILE"
echo "Skipping tables: ${SKIP_TABLES[*]}" | tee -a "$LOG_FILE"
echo "------------------------------------------------------" | tee -a "$LOG_FILE"

# Get list of tables in the schema
TABLES=$(psql "$CONNECTION_STR" -t -c "SELECT tablename FROM pg_tables WHERE schemaname = '$SCHEMA_NAME';")

# Process each table
for TABLE in $TABLES; do
  TABLE=$(echo "$TABLE" | xargs) # Trim whitespace

  # Check if the table should be skipped
  SKIP=false
  for SKIP_TABLE in "${SKIP_TABLES[@]}"; do
    if [ "$TABLE" = "$SKIP_TABLE" ]; then
      SKIP=true
      echo "Skipping table: $SCHEMA_NAME.$TABLE (already processed)" | tee -a "$LOG_FILE"
      break
    fi
  done
  
  # Process the table if it's not in the skip list
  if [ "$SKIP" = false ]; then
    echo "Processing table: $SCHEMA_NAME.$TABLE" | tee -a "$LOG_FILE"
    echo "Start time: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
    
    # Run VACUUM (VERBOSE, ANALYZE) and capture output
    psql "$CONNECTION_STR" -c "VACUUM (VERBOSE, ANALYZE) $SCHEMA_NAME.$TABLE;" 2>&1 | tee -a "$LOG_FILE"
    
    echo "End time: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
    echo "------------------------------------------------------" | tee -a "$LOG_FILE"
  fi
done

echo "VACUUM (VERBOSE, ANALYZE) process completed at $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
