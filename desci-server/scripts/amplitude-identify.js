#!/usr/bin/env node
/**
 * Script to update user identity/properties on Amplitude (Sciweave) via the Identify API
 * and verify the update by fetching the user profile.
 *
 * Usage:
 *   node scripts/amplitude-identify.js <userId> <propertiesJson>
 *
 * Examples:
 *   node scripts/amplitude-identify.js 123 '{"first_name":"John","last_name":"Doe","role":"researcher"}'
 *   node scripts/amplitude-identify.js 456 '{"plan_type":"premium","receive_marketing_updates":true}'
 *
 * Environment Variables:
 *   AMPLITUDE_API_KEY_SCIWEAVE - API key for Sciweave Amplitude project (for Identify API)
 *   AMPLITUDE_SECRET_KEY_SCIWEAVE - Secret key for Sciweave Amplitude project (for User Profile API)
 *
 * @see https://amplitude.com/docs/apis/analytics/identify
 * @see https://amplitude.com/docs/apis/analytics/user-profile
 */

const AMPLITUDE_IDENTIFY_ENDPOINT = 'https://api2.amplitude.com/identify';
const AMPLITUDE_PROFILE_ENDPOINT = 'https://profile-api.amplitude.com/v1/userprofile';

async function updateAmplitudeIdentity(userId, properties) {
  const apiKey = process.env.AMPLITUDE_API_KEY_SCIWEAVE;

  if (!apiKey) {
    console.error('❌ No Amplitude API key found.');
    console.error('   Set AMPLITUDE_API_KEY_SCIWEAVE environment variable.');
    process.exit(1);
  }

  console.log(`📊 Updating Amplitude identity for user: ${userId}`);
  console.log(`   Properties:`, properties);

  // Build the identification object per Amplitude Identify API spec
  const identification = {
    user_id: String(userId),
    user_properties: {
      $set: properties,
    },
  };

  try {
    const response = await fetch(AMPLITUDE_IDENTIFY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        api_key: apiKey,
        identification: JSON.stringify([identification]),
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(`❌ Amplitude API error (${response.status}):`, responseText);

      if (response.status === 429) {
        console.error('   Rate limited. Wait 15 seconds and try again.');
        console.error('   Note: Amplitude limits 1800 updates per user per hour.');
      }
      process.exit(1);
    }

    console.log(`✅ Successfully updated user ${userId} on Amplitude (sciweave)`);
    console.log(`   Response:`, responseText);

    // Verify the update by fetching user profile
    await verifyUserProfile(userId);
  } catch (error) {
    console.error('❌ Failed to call Amplitude API:', error.message);
    process.exit(1);
  }
}

async function verifyUserProfile(userId) {
  const secretKey = process.env.AMPLITUDE_SECRET_KEY_SCIWEAVE;

  if (!secretKey) {
    console.warn('\n⚠️  Cannot verify update: AMPLITUDE_SECRET_KEY_SCIWEAVE not set.');
    console.warn('   Set this environment variable to enable profile verification.');
    return;
  }

  console.log(`\n🔍 Verifying user profile for user: ${userId}`);

  try {
    const url = `${AMPLITUDE_PROFILE_ENDPOINT}?user_id=${encodeURIComponent(userId)}&get_amp_props=true`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Api-Key ${secretKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed to fetch user profile (${response.status}):`, errorText);

      if (response.status === 401) {
        console.error('   Invalid or missing Secret Key.');
      }
      return;
    }

    const profileData = await response.json();

    console.log(`✅ User profile retrieved successfully`);

    if (profileData.userData?.amp_props) {
      console.log('\n📋 Current User Properties:');
      const props = profileData.userData.amp_props;
      const sortedKeys = Object.keys(props).sort();

      for (const key of sortedKeys) {
        console.log(`   ${key}: ${JSON.stringify(props[key])}`);
      }
    } else {
      console.log('   No user properties found (user may not have been seen yet).');
      console.log("   Note: Properties apply after the user's next event.");
    }

    if (profileData.userData?.cohort_ids) {
      console.log(`\n👥 Cohort IDs: ${profileData.userData.cohort_ids.join(', ')}`);
    }
  } catch (error) {
    console.error('❌ Failed to verify user profile:', error.message);
  }
}

// Parse command line arguments
function printUsage() {
  console.log(`
Usage: node scripts/amplitude-identify.js <userId> <propertiesJson>

Arguments:
  userId          The user ID to update on Amplitude
  propertiesJson  JSON object of properties to set (snake_case keys)

Available properties (from web app):
  first_name, last_name, email, role, plan_type, hostname,
  actual_country, ip_country, timezone, locale, potential_vpn,
  receive_marketing_updates

Examples:
  node scripts/amplitude-identify.js 123 '{"first_name":"John","last_name":"Doe","role":"researcher"}'
  node scripts/amplitude-identify.js 456 '{"plan_type":"premium","receive_marketing_updates":true}'

Environment Variables:
  AMPLITUDE_API_KEY_SCIWEAVE     API key for Identify API (required)
  AMPLITUDE_SECRET_KEY_SCIWEAVE  Secret key for User Profile API (optional, for verification)
`);
}

const args = process.argv.slice(2);

if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
}

const [userId, propertiesJson] = args;

// Parse properties JSON
let properties;
try {
  properties = JSON.parse(propertiesJson);
} catch (error) {
  console.error(`❌ Invalid JSON for properties: ${propertiesJson}`);
  console.error(`   Error: ${error.message}`);
  process.exit(1);
}

// Run the update
updateAmplitudeIdentity(userId, properties);
