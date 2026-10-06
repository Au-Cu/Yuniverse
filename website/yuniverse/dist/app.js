const RELEASE = {
  fileName: "Yuniverse-Setup-1.0.0.exe",
  size: 156627688,
  sha256: "ce89ef6896780feb7926b0534ba744047009d85339643e318af49ab816a5dc65",
  parts: [
    ["Yuniverse-Setup-1.0.0.part01.bin", 20971520, "d9089bf49eaa93652e9e8a968ea7529626a86cddbc58faf25a5dbcbad268a6fe"],
    ["Yuniverse-Setup-1.0.0.part02.bin", 20971520, "8aae754e6d0da3ed004f42d2bdf365fec6640ea27498ec9458300b6ba95c37bc"],
    ["Yuniverse-Setup-1.0.0.part03.bin", 20971520, "6fce435feae65c7bdcb4b895328da493b9ace53f367a80ed92b94f8df24dc212"],
    ["Yuniverse-Setup-1.0.0.part04.bin", 20971520, "c44bcebcfe12702a2fd0fbd11fc863af877994db90d4e74d0e1d2da00ed91452"],
    ["Yuniverse-Setup-1.0.0.part05.bin", 20971520, "9bffae0db03c4336745989ecb9b209f3d94b1b0908b936a7803e29ac62236ef4"],
    ["Yuniverse-Setup-1.0.0.part06.bin", 20971520, "b49823235a54f7b1f478d19c75c7e149ec493db5c9b9e6b22fc31bd00f1386eb"],
    ["Yuniverse-Setup-1.0.0.part07.bin", 20971520, "2e085abad92bb52bc7fa65eddb816a390a5f01903b2b2b06b4e5468a869c3051"],
    ["Yuniverse-Setup-1.0.0.part08.bin", 9827048, "228300d59c79b9ba090f5e280295bfcbfceb9e18d008a69ee537fdb0f964e413"]
  ]
};

const downloadButton = document.querySelector("#download-button");
const downloadProgress = document.querySelector("#download-progress");
const progressLabel = document.querySelector("#progress-label");
const progressPercent = document.querySelector("#progress-percent");
const progressBar = document.querySelector("#progress-bar");
const downloadStatus = document.querySelector("#download-status");
const copyHash = document.querySelector("#copy-hash");

const toHex = (buffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");

function setProgress(received, label) {
  const percent = Math.min(100, Math.round((received / RELEASE.size) * 100));
  progressBar.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
  progressLabel.textContent = label;
}

async function fetchVerifiedPart(part, partIndex, completedBytes) {
  const [name, expectedSize, expectedHash] = part;
  const response = await fetch(`./downloads/${name}`, { cache: "no-store" });
  if (!response.ok || !response.body) throw new Error(`分片 ${partIndex + 1} 下载失败（HTTP ${response.status}）`);

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    setProgress(completedBytes + received, `正在下载 ${partIndex + 1} / ${RELEASE.parts.length}`);
  }
  if (received !== expectedSize) throw new Error(`分片 ${partIndex + 1} 大小不正确`);

  const bytes = new Uint8Array(expectedSize);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const actualHash = toHex(await crypto.subtle.digest("SHA-256", bytes));
  if (actualHash !== expectedHash) throw new Error(`分片 ${partIndex + 1} 校验失败，请重试`);
  return bytes;
}

async function downloadRelease() {
  if (!window.crypto?.subtle) {
    downloadStatus.textContent = "当前浏览器不支持安全校验，请换用新版 Edge、Chrome 或 Firefox。";
    return;
  }

  downloadButton.disabled = true;
  downloadProgress.hidden = false;
  downloadStatus.textContent = "请保持页面打开。所有分片均通过 SHA-256 校验后才会生成安装包。";
  setProgress(0, "正在连接下载服务器…");

  const verifiedParts = [];
  let completedBytes = 0;
  try {
    for (let index = 0; index < RELEASE.parts.length; index += 1) {
      const bytes = await fetchVerifiedPart(RELEASE.parts[index], index, completedBytes);
      verifiedParts.push(bytes);
      completedBytes += bytes.byteLength;
      setProgress(completedBytes, `已校验 ${index + 1} / ${RELEASE.parts.length}`);
    }

    if (completedBytes !== RELEASE.size) throw new Error("安装包总大小不正确");
    setProgress(RELEASE.size, "校验完成，正在生成安装包…");
    const blob = new Blob(verifiedParts, { type: "application/vnd.microsoft.portable-executable" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = RELEASE.fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    downloadStatus.textContent = `完成：${RELEASE.fileName} 已通过分片校验并交给浏览器保存。`;
  } catch (error) {
    console.error(error);
    downloadStatus.textContent = `${error.message || "下载失败"}。请检查网络后重新点击。`;
    setProgress(completedBytes, "下载中断");
  } finally {
    downloadButton.disabled = false;
  }
}

downloadButton.addEventListener("click", downloadRelease);

copyHash.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(RELEASE.sha256);
    copyHash.textContent = "已复制";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#release-hash"));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    copyHash.textContent = "请复制";
  }
  setTimeout(() => { copyHash.textContent = "复制"; }, 1800);
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll(".reveal").forEach((element, index) => {
  element.style.transitionDelay = `${Math.min(index % 3, 2) * 80}ms`;
  revealObserver.observe(element);
});
