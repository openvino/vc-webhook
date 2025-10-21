import express from "express";
import { appConfig } from "./config/index.js";
import routes from "./routes/index.js";

const app = express();

app.use(express.text({ type: "*/*" })); // keep raw body as text
app.use(routes);

app.listen(appConfig.port, () => {
	console.info(`Webhook listening on :${appConfig.port}`);
});
