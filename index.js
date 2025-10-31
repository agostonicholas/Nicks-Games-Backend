const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
const app = require("./app");
const { initDb } = require("./db");

async function start() {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to initialize database connection:", err);
    process.exit(1);
  }
}

start();
