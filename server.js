require("dotenv").config();

const { sendWhatsApp } = require("./services/whatsappService");
const { handleBooking } = require("./controllers/bookingFlow");
const session = require("express-session");
const db = require("./database/database");

const { saveAppointment } = require("./controllers/bookingController");

const { GoogleGenAI } = require("@google/genai");


const express = require("express");

const app = express();
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

app.use(express.json());
app.use(session({
    secret: "salon-secret-key",
    resave: false,
    saveUninitialized: true
}));

app.use(express.static("public"));

app.get("/", (req, res) => {
    res.send("🚀 AI Salon Assistant is Running!");
});

// AI Chat API
app.post("/chat", async (req, res) => {

    try {

        const message = req.body.message;

        const flow = await handleBooking(req, message);

        if (flow.handled) {
            return res.json({
                reply: flow.reply
            });
        }

        const prompt = `

You are Aura, the AI receptionist of Glow Beauty Salon.

Salon Details:
- Haircut ₹300
- Hair Spa ₹800
- Facial ₹1000
- Open 9 AM to 8 PM

Rules:
1. Be friendly and professional.
2. If the customer asks about services, answer normally.
3. If the customer wants to book an appointment, collect:
   - Name
   - Phone
   - Service
   - Date
   - Time

When ALL booking details are available, reply ONLY in this format:

BOOKING
Name: <customer name>
Phone: <phone number>
Service: <service>
Date: <date>
Time: <time>

Otherwise continue chatting normally.

Customer:
${message}
`;

        const result = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });

        const reply = result.text;

if (reply.startsWith("BOOKING")) {

    const lines = reply.split("\n");

    const name = lines[1].replace("Name:", "").trim();
    const phone = lines[2].replace("Phone:", "").trim();
    const service = lines[3].replace("Service:", "").trim();
    const date = lines[4].replace("Date:", "").trim();
    const time = lines[5].replace("Time:", "").trim();

    saveAppointment(name, phone, service, date, time);

    return res.json({
        reply: `✅ Appointment booked successfully for ${name}!`
    });
}

res.json({
    reply
});

    }catch (err) {

    console.error(err);

    // If Gemini quota is exhausted, don't stop the booking system
    if (
        err.status === 429 ||
        (err.message && err.message.includes("RESOURCE_EXHAUSTED"))
    ) {

        return res.json({
            reply: "⚠️ AI assistant is temporarily busy, but booking is still available. Please type 'Haircut', 'Hair Spa', or 'Facial' to continue booking."
        });
    }

    res.json({
        reply: "❌ Something went wrong. Please try again."
    });

}

});

// Get all appointments
app.get("/appointments", (req, res) => {

    db.all(
        "SELECT * FROM appointments ORDER BY id DESC",
        [],
        (err, rows) => {

            if (err) {
                return res.status(500).json({
                    error: err.message
                });
            }

            res.json(rows);
        }
    );

});


// ================= DELETE APPOINTMENT =================
app.delete("/appointments/:id", (req, res) => {

    db.run(
        "DELETE FROM appointments WHERE id = ?",
        [req.params.id],
        function (err) {

            if (err) {
                return res.status(500).json({
                    error: err.message
                });
            }

            res.json({
                success: true
            });

        }
    );

});

// ================= UPDATE STATUS =================
app.put("/appointments/:id", (req, res) => {

    db.run(
        "UPDATE appointments SET status = ? WHERE id = ?",
        [req.body.status, req.params.id],
        function (err) {

            if (err) {
                return res.status(500).json({
                    error: err.message
                });
            }

            res.json({
                success: true
            });

        }
    );

});


// ================= ADMIN PAGE =================
app.get("/admin", (req, res) => {
    res.sendFile(__dirname + "/public/admin.html");
});


app.listen(3000, () => {
    console.log("🚀 Server started on http://localhost:3000");
});