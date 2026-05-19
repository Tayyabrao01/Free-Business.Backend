require('dotenv').config();
const mongoose = require('mongoose');

const testConnection = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected successfully to database: datas');
    await mongoose.disconnect();
    console.log('Connection test completed.');
  } catch (error) {
    console.error('Database connection failed:', error.message);
    process.exit(1);
  }
};

testConnection();