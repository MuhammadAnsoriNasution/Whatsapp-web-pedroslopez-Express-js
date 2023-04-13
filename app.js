const { Client, LocalAuth } = require("whatsapp-web.js");
const express = require("express");
const { body, validationResult } = require("express-validator");
const fs = require("fs");
const qrcode = require("qrcode");
const http = require("http");
const { phoneNumberFormatter } = require("./helpers/formatter");
var jwt = require('jsonwebtoken');
const app = express();
const { Server } = require("socket.io");
const server = http.createServer(app);
const io = new Server(server);
const dotenv = require('dotenv');
const multer = require('multer');
const upload = multer();
var listToken = require('./list_token.json');
const { validateUser, validateRefreshTokenUser } = require("./middleware/authenticated")
const port = process.env.PORT || 8000;

dotenv.config();
app.use(express.urlencoded());
app.use(express.json());

const client = new Client({
  restartOnAuthFail: true,
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu",
    ],
  },
  authStrategy: new LocalAuth(),
});

client.initialize();

app.get("/auth/qr", (req, res) => {
  res.sendFile("index.html", { root: __dirname, });
});

app.post("/api/v1/auth/login", upload.none(), function (req, res) {
  if (req.body.username === "wa_bot" && req.body.password === "Mesjid32@Secret") {
    var token = jwt.sign({ data: { username: 'wa_bot' } }, process.env.SECRET_TOKEN, { expiresIn: '1h' });
    var refreshtoken = jwt.sign({ data: { username: 'wa_bot' } }, process.env.SECRET_REFRESH_TOKEN, { expiresIn: '1d' });

    fs.writeFileSync('list_token.json',
      JSON.stringify([...listToken,
      {
        "token": token,
        "refreshtoken": refreshtoken,
        "date": new Date(),
        "isExpired": false
      }
      ]
      )
    );
    return res.status(200).json({ token: token, refreshtoken: refreshtoken, expiresIn: 60 })
  } else {
    return res.status(401).json({
      staus: false,
      message: "Unauthorized"
    })
  }
})

app.post("/api/v1/auth/refresh-token", validateRefreshTokenUser, function (req, res) {
  var token = jwt.sign({ data: { username: 'wa_bot' } }, process.env.SECRET_TOKEN, { expiresIn: '1h' });
  var refreshtoken = jwt.sign({ data: { username: 'wa_bot' } }, process.env.SECRET_REFRESH_TOKEN, { expiresIn: '1d' });
  return res.status(200).json({ token: token, refreshtoken: refreshtoken, expiresin: 60 })
})

app.post("/api/v1/auth/logout", validateUser, function (req, res) {
  var newListToken = listToken.map((token) => token.token === req.headers?.authorization.replace('Bearer ', '') ? ({ ...token, isExpired: true }) : token)
  console.log(newListToken)
  fs.writeFileSync('list_token.json',
    JSON.stringify(newListToken)
  )

  return res.status(200).json({
    status: true,
    user: req.user
  })
})


io.on("connection", function (socket) {
  console.log("connection")
  socket.emit("message", "Connecting...");

  client.on("qr", (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit("qr", url);
      socket.emit("message", "QR Code received, scan please!");
    });
  });

  client.on('loading_screen', (percent, message) => {
    console.log('LOADING SCREEN', percent, message);
  });
  client.on('change_state', state => {
    console.log('CHANGE STATE', state);
  });


  if (client.info !== undefined) {
    socket.emit("ready", "Whatsapp is ready!");
    socket.emit("message", "Whatsapp is ready!");
    console.log("ready")
  }

  client.on("ready", () => {
    console.log("ready");
    socket.emit("ready", "Whatsapp is ready!");
    socket.emit("message", "Whatsapp is ready!");
  });

  client.on("authenticated", () => {
    console.log("authenticated");
    socket.emit("authenticated", "Whatsapp is authenticated!");
    socket.emit("message", "Whatsapp is authenticated!");
  });

  client.on("auth_failure", function (session) {
    socket.emit("message", "Auth failure, restarting...");
  });

  client.on("disconnected", (reason) => {
    socket.emit("message", "Whatsapp is disconnected!");
    client.destroy();
    client.initialize();
  });
});

const checkRegisteredNumber = async function (number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
};

app.post("/api/v1/initialize", validateUser, function (req, ress) {
  try {
    client.destroy();
    client.initialize();
  } catch (error) {
    client.initialize();
  }
  ress.json({ success: "client di hapus" });
});


// Send message
app.post(
  "/api/v1/send-message",
  validateUser,
  [body("number").notEmpty(), body("message").notEmpty()],
  upload.none(),
  async (req, res) => {
    if (client.info === undefined) {
      return res.status(405).json({
        status: false,
        message: 'the system is not ready yet'
      })
    }
    const errors = validationResult(req).formatWith(({ msg }) => {
      return msg;
    });

    if (!errors.isEmpty()) {
      return res.status(421).json({
        status: false,
        message: errors.mapped(),
      });
    }

    const number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;

    const isRegisteredNumber = await checkRegisteredNumber(number);

    if (!isRegisteredNumber) {
      return res.status(422).json({
        status: false,
        message: "The number is not registered",
      });
    }

    try {
      client
        .sendMessage(number, message)
        .then((response) => {
          res.status(200).json({
            status: true,
            response: response,
          });
        })
        .catch((err) => {
          res.status(500).json({
            status: false,
            response: err,
          });
        });
    } catch (error) {
      res.status(500).json({
        status: false,
        response: error,
      });
    }
  }
);

const findGroupByName = async function (name) {
  const group = await client.getChats().then((chats) => {
    return chats.find(
      (chat) => chat.isGroup && chat.name.toLowerCase() == name.toLowerCase()
    );
  });
  return group;
};

// Send message to group
// You can use chatID or group name, yea!
app.post(
  "/api/v1/send-group-message",
  validateUser,
  [
    body("id").custom((value, { req }) => {
      if (!value && !req.body.name) {
        throw new Error("Invalid value, you can use `id` or `name`");
      }
      return true;
    }),
    body("message").notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req).formatWith(({ msg }) => {
      return msg;
    });

    if (!errors.isEmpty()) {
      return res.status(422).json({
        status: false,
        message: errors.mapped(),
      });
    }

    let chatId = req.body.id;
    const groupName = req.body.name;
    const message = req.body.message;

    if (!chatId) {
      const group = await findGroupByName(groupName);
      if (!group) {
        return res.status(422).json({
          status: false,
          message: "No group found with name: " + groupName,
        });
      }
      chatId = group.id._serialized;
    }

    client
      .sendMessage(chatId, message)
      .then((response) => {
        res.status(200).json({
          status: true,
          response: response,
        });
      })
      .catch((err) => {
        res.status(500).json({
          status: false,
          response: err,
        });
      });
  }
);
server.listen(port, function () {
  console.log("App running on http://localhost:" + port);
});

// list api