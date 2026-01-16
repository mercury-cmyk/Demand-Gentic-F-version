import axios from 'axios';
import "dotenv/config";

const API_URL = process.env.API_URL || "http://localhost:5000";

async function enableCampaign() {
  const campaignId = process.argv[2];

  if (!campaignId) {
    console.error("Please provide a campaign ID.");
    process.exit(1);
  }

  try {
    // 1. Get auth token
    const loginResponse = await axios.post(
      `${API_URL}/api/auth/login`,
      {
        username: "admin",
        password: "admin123",
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const token = loginResponse.data.token;
    if (!token) {
      console.error("Failed to get auth token.");
      process.exit(1);
    }

    // 2. Enable campaign
    const response = await axios.patch(
      `${API_URL}/api/campaigns/${campaignId}`,
      {
        status: "active",
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.status === 200) {
      console.log(`Campaign ${campaignId} enabled successfully.`);
    } else {
      console.error(`Failed to enable campaign ${campaignId}. Status: ${response.status}`);
    }
  } catch (error: any) {
    console.error(`An error occurred: ${error.message}`);
    if (error.response) {
      console.error(error.response.data);
    }
    process.exit(1);
  }
}

enableCampaign();
