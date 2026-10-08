const mongoose = require('mongoose');

const uri = "mongodb+srv://sklitellp:aD4b2b2r1uMhX5z2@sklite.j9m7w.mongodb.net/test?retryWrites=true&w=majority";

async function checkQuotes() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const collection = db.collection('purchaseorders');
  
  // Find POs that are in rfq state
  const pos = await collection.find({ status: 'rfq' }).toArray();
  console.log('Found ' + pos.length + ' POs in rfq state');
  
  for (const po of pos) {
    console.log('PO ID:', po._id.toString());
    console.log('Quotes:', po.quotes ? po.quotes.length : 0);
    if (po.quotes && po.quotes.length > 0) {
      console.log('Quote data:', JSON.stringify(po.quotes, null, 2));
    }
  }
  
  await mongoose.disconnect();
}

checkQuotes().catch(console.error);
