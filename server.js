const app = require("./app");
const { initDb } = require("./db");

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;

async function start() {
  try {
    await initDb();
    app.listen(PORT, () => console.log(`Server on ${PORT}`));
  } catch (err) {
    console.error("Failed to initialize database connection:", err);
    process.exit(1);
  }
}

start();
