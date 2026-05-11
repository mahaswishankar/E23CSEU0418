const axios = require("axios");
const { getAuthToken } = require("../config/auth");

const Log = async (stack, level, packageName, message) => {
  try {
    const token = await getAuthToken();
    const response = await axios.post(
      "http://4.224.186.213/evaluation-service/logs",
      { stack, level, package: packageName, message },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  } catch (error) {
    console.log("Logging Failed");
  }
};

module.exports = Log;
