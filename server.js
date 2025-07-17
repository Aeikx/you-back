const logger = require("./logger");
require('dotenv').config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const moment = require("moment-timezone");
const admin = require("firebase-admin");

// Firebase Admin SDK 초기화
const serviceAccount = require("./cj-escape-room-firebase-adminsdk-fbsvc-8c9c1d97d2.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();

// CORS 설정
app.use(
  cors({
    origin: [
      "https://web-room-escape-front-md2eap8bfeb3cb79.sel5.cloudtype.app",
      "https://web-room-escape-front-md2eap8bfeb3cb79.sel5.cloudtype.app/",
      "http://localhost:5173",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

const { RateLimiterMemory } = require('rate-limiter-flexible');

// Rate Limiting 설정
const rateLimiter = new RateLimiterMemory({
  points: 100, // 1분 동안 100번의 요청 허용
  duration: 60, // 1분 (초 단위)
  blockDuration: 600, // 10분 (초 단위)
});

const rateLimiterMiddleware = (req, res, next) => {
  rateLimiter.consume(req.ip)
    .then(() => {
      next();
    })
    .catch(() => {
      res.status(429).send('너무 많은 요청을 보냈습니다. 10분 후에 다시 시도해주세요.');
    });
};

// 모든 요청에 Rate Limiter 적용
app.use(rateLimiterMiddleware);

app.use(express.json());
app.use(cookieParser());

const correctAnswers = {
  stage1: "HIGH",
  stage2: "7953",
  stage3: "96123",
  stage4: "fish",
  stage5: "O2",
  stage6: "11",
  stage7: "101",
  stage8: "46000",
  stage9: "gpt",
  stage10: "절댓값",
  stage11: "000000",
  stage12: "20",
  stage13: "592641",
};

//--- API Endpoints ---

// 회원가입
app.post("/signup", async (req, res) => {
  const { userID, userName, userPW } = req.body;

  try {
    const userRef = db.collection("users").doc(userID);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      logger.warn(`Signup failed: User ID ${userID} already exists.`);
      return res.send("false");
    }

    const newUser = {
      userId: userID,
      userName: userName,
      userPw: userPW,
    };

    const stageClear = {
      userId: userID,
      stage1: "unclear",
      stage2: "unclear",
      stage3: "unclear",
      stage4: "unclear",
      stage5: "unclear",
      stage6: "unclear",
      stage7: "unclear",
      stage8: "unclear",
      stage9: "unclear",
      stage10: "unclear",
      stage11: "unclear",
      stage12: "unclear",
      stage13: "unclear",
    };

    // Batch write for atomicity
    const batch = db.batch();
    batch.set(userRef, newUser);
    batch.set(db.collection("users_clear").doc(userID), stageClear);

    await batch.commit();

    logger.info(`User ${userID} signed up successfully.`);
    res.send("true");
  } catch (error) {
    logger.error("Error during signup:", error);
    res.status(500).send("Server error during signup.");
  }
});

// 로그인
app.post("/login", async (req, res) => {
  const { Id, Pw } = req.body;

  try {
    const userRef = db.collection("users").doc(Id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      logger.warn(`Login failed: User ID ${Id} not found.`);
      return res.json({ loggedIn: false });
    }

    const user = userDoc.data();
    if (user.userPw === Pw) {
      res.cookie("userId", Id, {
        httpOnly: true,
        sameSite: "none",
        secure: true,
        path: "/",
        maxAge: 60 * 60 * 1000, // 1 hour
      });
      logger.info(`User ${Id} logged in successfully.`);
      res.json({ loggedIn: true, userId: Id });
    } else {
      logger.warn(`Login failed: Incorrect password for User ID ${Id}.`);
      res.json({ loggedIn: false });
    }
  } catch (error) {
    logger.error("Error during login:", error);
    res.status(500).send("Server error during login.");
  }
});

// 로그인 확인
app.get("/check-login", (req, res) => {
  const userId = req.cookies.userId;
  if (userId) {
    res.json({ loggedIn: true, userId });
  } else {
    res.json({ loggedIn: false });
  }
});

// 로그아웃
app.get("/logout", (req, res) => {
  res.clearCookie("userId", {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/",
  });
  logger.info("User logged out successfully.");
  res.json({ success: true });
});

// 정답 제출 및 확인
app.post("/q_ans", async (req, res) => {
  const userId = req.cookies.userId;
  const stage = Object.keys(req.body)[0];
  const submittedAnswer = req.body[stage];

  // 1. 로그 기록 (정답 여부와 상관없이)
  logger.info(
    `Answer Log - User: ${
      userId || "Not Logged In"
    }, Stage: ${stage}, Submitted: "${submittedAnswer}"`
  );

  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: "User not logged in." });
  }
  if (!stage || submittedAnswer === undefined) {
    return res.status(400).json({
      success: false,
      message: "Stage or answer information is missing.",
    });
  }

  // 2. 정답 확인
  const isCorrect = correctAnswers[stage] === submittedAnswer;

  if (isCorrect) {
    try {
      const userClearRef = db.collection("users_clear").doc(userId);
      await userClearRef.update({ [stage]: "clear" });

      logger.info(`User ${userId} cleared ${stage}.`);
      res.status(200).json({ correct: true });
    } catch (error) {
      logger.error(
        `Error updating stage clear status for user ${userId}:`,
        error
      );
      res
        .status(500)
        .json({ success: false, message: "Failed to update clear status." });
    }
  } else {
    res.status(200).json({ correct: false });
  }
});

// 명예의 전당 입성
app.get("/clear", async (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: "User not logged in." });
  }

  try {
    const userClearRef = db.collection("users_clear").doc(userId);
    const userClearDoc = await userClearRef.get();

    if (!userClearDoc.exists) {
      return res
        .status(404)
        .json({ success: false, message: "User clear data not found." });
    }

    const userClearData = userClearDoc.data();
    const clearedStages = Object.values(userClearData).filter(
      (status) => status === "clear"
    ).length;

    logger.info(`User ${userId} has cleared ${clearedStages} stages.`);

    if (clearedStages === 13) {
      const hallOfFameQuery = await db
        .collection("hall_of_fame")
        .where("userId", "==", userId)
        .get();

      if (hallOfFameQuery.empty) {
        const userDoc = await db.collection("users").doc(userId).get();
        const userName = userDoc.exists ? userDoc.data().userName : "Unknown";

        const userRank = {
          userName: userName,
          userId: userId,
          clearTime: moment().tz("Asia/Seoul").format("YYYY-MM-DD HH:mm:ss"),
        };

        await db.collection("hall_of_fame").add(userRank);
        logger.info(`User ${userId} has been added to the Hall of Fame.`);
      } else {
        logger.info(`User ${userId} is already in the Hall of Fame.`);
      }
    }
    res.json({ success: true });
  } catch (error) {
    logger.error(`Error in /clear endpoint for user ${userId}:`, error);
    res.status(500).json({ success: false, message: "An error occurred." });
  }
});

// 명예의 전당 목록 조회
app.get("/hall", async (req, res) => {
  try {
    const snapshot = await db
      .collection("hall_of_fame")
      .orderBy("clearTime", "asc")
      .get();
    const hallOfFameData = snapshot.docs.map((doc) => doc.data());
    res.send(hallOfFameData);
  } catch (error) {
    logger.error("Error fetching hall of fame:", error);
    res.status(500).send("Failed to fetch hall of fame.");
  }
});

// 클리어한 스테이지 정보 조회
app.get("/clear-stage", async (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) {
    return res.json({});
  }
  try {
    const userClearRef = db.collection("users_clear").doc(userId);
    const doc = await userClearRef.get();
    if (doc.exists) {
      res.json(doc.data());
    } else {
      res.json({});
    }
  } catch (error) {
    logger.error("Error fetching clear stage data:", error);
    res.status(500).send("Failed to fetch clear stage data.");
  }
});

// 서버 시작
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT} with Firestore DB.`);
});


// 서버 상태 확인용
app.get("/", (req, res) => {
  res.send("Server is running!");
});