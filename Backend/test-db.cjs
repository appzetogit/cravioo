require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');

async function test() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI is not set in the environment / Backend/.env');
    }

    await mongoose.connect(uri);
    console.log('MongoDB Connected Successfully');
    console.log('Database:', mongoose.connection.name);

    const db = mongoose.connection.db;
    const foodOrder = await db.collection('foodorders').findOne({ orderId: 'QC78472842' });
    const returnOrder = await db.collection('sellerreturns').findOne({ orderId: 'QC78472842' });

    console.log('FoodOrder:', !!foodOrder, foodOrder?.orderType, foodOrder?.tripType, foodOrder?.documentType);
    console.log('SellerReturn:', !!returnOrder, returnOrder?.returnStatus);
}

test()
    .catch((err) => {
        // Print only the message; never the connection string
        console.error('DB test failed:', err.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
