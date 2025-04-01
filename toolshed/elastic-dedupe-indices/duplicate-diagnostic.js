require('dotenv').config();
const { Client } = require('@elastic/elasticsearch');

// Configuration
const config = {
  closedIndex: 'works_closed_2024_09_04_dedupe_optimized2',
  openIndex: 'works_2024_08_27_dedupe_optimized2',
  testExampleId: ''
};

// Initialize ES client
const client = new Client({ 
  node: process.env.ES_HOST,
  auth: {
    apiKey: process.env.ES_API_KEY
  },
  maxRetries: 3,
  requestTimeout: 60000,
  ssl: {
    rejectUnauthorized: false
  },
  tls: {
    rejectUnauthorized: false
  }
});

async function countDocuments(index) {
  const result = await client.count({ index });
  return result.count;
}

async function checkForSpecificDuplicate(id) {
  console.log(`Checking for document ID: ${id}`);
  
  // Check closed index
  try {
    const closedResult = await client.get({
      index: config.closedIndex,
      id: id
    });
    console.log(`✓ Found in closed index: ${JSON.stringify(closedResult._source ? Object.keys(closedResult._source) : {})}`);
  } catch (error) {
    console.log(`✗ Not found in closed index: ${error.message}`);
  }
  
  // Check open index
  try {
    const openResult = await client.get({
      index: config.openIndex,
      id: id
    });
    console.log(`✓ Found in open index: ${JSON.stringify(openResult._source ? Object.keys(openResult._source) : {})}`);
  } catch (error) {
    console.log(`✗ Not found in open index: ${error.message}`);
  }
}

async function findRandomDocumentsInBothIndexes(sampleSize = 10) {
  console.log(`Looking for ${sampleSize} random documents that might exist in both indexes...`);
  
  const result = await client.search({
    index: config.closedIndex,
    body: {
      size: 10000,
      query: {
        match_all: {}
      }
    }
  });
  
  let foundCount = 0;
  const hits = result.hits.hits;
  let checked = 0;
  
  for (const hit of hits) {
    if (foundCount >= sampleSize) break;
    checked++;
    
    try {
      const id = hit._id;
      const exists = await client.exists({
        index: config.openIndex,
        id: id
      });
      
      if (exists) {
        foundCount++;
        console.log(`Found duplicate ${foundCount}/${sampleSize}: ${id}`);
        await checkForSpecificDuplicate(id);
      }
    } catch (error) {
      console.log(`Error checking document: ${error.message}`);
    }
  }
  
  console.log(`Checked ${checked} documents, found ${foundCount} duplicates`);
  return foundCount;
}

async function testDeletionById(id) {
  console.log(`Testing deletion of document ID: ${id} from ${config.openIndex}`);
  
  try {
    // First confirm it exists
    const exists = await client.exists({
      index: config.openIndex,
      id: id
    });
    
    if (!exists) {
      console.log(`Document ${id} doesn't exist in ${config.openIndex}`);
      return false;
    }
    
    // Try to delete using deleteByQuery
    const deleteResult = await client.deleteByQuery({
      index: config.openIndex,
      refresh: true,
      body: {
        query: {
          ids: {
            values: [id]
          }
        }
      }
    });
    
    console.log(`Delete result: ${JSON.stringify(deleteResult)}`);
    
    // Check if it's really gone
    const stillExists = await client.exists({
      index: config.openIndex,
      id: id
    });
    
    if (stillExists) {
      console.log(`❌ Document ${id} still exists after deleteByQuery!`);
      
      // Try direct delete
      console.log("Trying direct delete method instead");
      await client.delete({
        index: config.openIndex,
        id: id,
        refresh: true
      });
      
      const finalCheck = await client.exists({
        index: config.openIndex,
        id: id
      });
      
      if (finalCheck) {
        console.log(`❌ Document ${id} still exists after direct delete!`);
        return false;
      } else {
        console.log(`✓ Document ${id} successfully deleted with direct delete method`);
        return true;
      }
    } else {
      console.log(`✓ Document ${id} successfully deleted with deleteByQuery`);
      return true;
    }
  } catch (error) {
    console.log(`Error during deletion test: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    console.log("=== Elasticsearch Duplicate Diagnostic Tool ===");
    
    // Check index sizes
    const closedCount = await countDocuments(config.closedIndex);
    const openCount = await countDocuments(config.openIndex);
    console.log(`Closed index (${config.closedIndex}): ${closedCount.toLocaleString()} documents`);
    console.log(`Open index (${config.openIndex}): ${openCount.toLocaleString()} documents`);
    
    // Check specific example
    console.log("\n=== Checking specific example ===");
    const exampleId = config.testExampleId;
    await checkForSpecificDuplicate(exampleId);
    
    // Find random documents in both indexes
    console.log("\n=== Finding random duplicates ===");
    const duplicatesFound = await findRandomDocumentsInBothIndexes(1);
    
    // Test deletion if duplicates found
    if (duplicatesFound > 0) {
      console.log("\n=== Testing deletion ===");
      await testDeletionById(exampleId);
    }
    
    console.log("\nDiagnostic complete!");
  } catch (error) {
    console.error("Diagnostic failed:", error);
  }
}

main(); 