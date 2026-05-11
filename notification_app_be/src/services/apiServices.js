const axios = require("axios");
const { getAuthToken } = require("../config/auth");

const fetchData = async (url) => {
  const token = await getAuthToken();
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

module.exports = { fetchData };
