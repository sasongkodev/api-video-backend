import { processWithYtDlp } from "./src/services/ytdlp.service";

async function main() {
  try {
    const res = await processWithYtDlp(new URL("https://www.youtube.com/watch?v=5C4LnVslA_Y&list=RDA9QRD0QJQDU&index=2"), "res-144");
    console.log("Success:", res);
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
