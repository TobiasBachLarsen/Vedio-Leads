module.exports = function(app, deps) {
  const { authMiddleware } = deps;

  app.get("/api/twilio/status", authMiddleware, (req, res) => {
    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from  = process.env.TWILIO_FROM_NUMBER;
    const appSid= process.env.TWILIO_TWIML_APP_SID;
    const configured = !!(sid && token && from);
    const ready      = !!(configured && appSid);
    res.json({ configured, ready, from: from || null, hasAppSid: !!appSid });
  });

  // Browser capability token — lets the browser place outbound calls via Twilio Voice JS SDK
  app.get("/api/twilio/token", authMiddleware, async (req, res) => {
    const sid    = process.env.TWILIO_ACCOUNT_SID;
    const token  = process.env.TWILIO_AUTH_TOKEN;
    const appSid = process.env.TWILIO_TWIML_APP_SID;
    if (!sid || !token || !appSid) {
      return res.status(503).json({ error: "Twilio ikke konfigureret" });
    }
    try {
      // Dynamically require twilio only if credentials are present (optional dependency)
      const twilio = require("twilio");
      const AccessToken    = twilio.jwt.AccessToken;
      const VoiceGrant     = AccessToken.VoiceGrant;
      const voiceGrant = new VoiceGrant({ outgoingApplicationSid: appSid, incomingAllow: false });
      const accessToken = new AccessToken(sid, token, process.env.TWILIO_API_KEY || token, {
        identity: req.userId,
        ttl: 3600
      });
      accessToken.addGrant(voiceGrant);
      res.json({ token: accessToken.toJwt(), from: process.env.TWILIO_FROM_NUMBER });
    } catch (err) {
      res.status(500).json({ error: "Kunne ikke generere token: " + err.message });
    }
  });

  // TwiML webhook — Twilio calls this to get instructions when a browser places a call
  app.post("/api/twilio/voice", (req, res) => {
    const to   = req.body.To   || req.query.To;
    const from = process.env.TWILIO_FROM_NUMBER;
    res.type("text/xml");
    if (to) {
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${from}">
    <Number>${to}</Number>
  </Dial>
</Response>`);
    } else {
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say language="da-DK">Intet nummer angivet.</Say></Response>`);
    }
  });
};
