const axios = require("axios");
require("dotenv").config();

let accessToken = "";

const getAuthToken = async () => {
  try {
    const response = await axios.post(
      "http://4.224.186.213/evaluation-service/auth",
      {
        email: process.env.EMAIL,
        name: process.env.NAME,
        rollNo: process.env.ROLL_NO,
        accessCode: process.env.ACCESS_CODE,
        clientID: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
      }
    );
    accessToken = response.data.access_token;
    console.log("Token Generated");
    return accessToken;
  } catch (error) {
    console.log(error.response?.data || error.message);
  }
};

module.exports = { getAuthToken };
