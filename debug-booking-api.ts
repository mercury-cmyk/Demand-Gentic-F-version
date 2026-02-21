import fetch from "node-fetch";

async function testBookingAPI() {
  try {
    const response = await fetch("http://localhost:8080/api/bookings/public/admin/demo");
    
    console.log("Status:", response.status);
    console.log("Headers:", Object.fromEntries(response.headers));
    
    const text = await response.text();
    console.log("Response body:", text);
    
    if (response.ok) {
      const data = JSON.parse(text);
      console.log("\n✅ Success!");
      console.log("User:", data.user);
      console.log("BookingType:", data.bookingType);
    } else {
      console.log("\n❌ Error");
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

testBookingAPI();
