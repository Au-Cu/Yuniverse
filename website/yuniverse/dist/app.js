const RELEASE = {
  fileName: "Yuniverse-Setup-1.0.0.exe",
  size: 156627302,
  sha256: "e5c5301a3fa647916fa5758f790446f702090f97bd531b1023861f77f30a47d9",
  parts: [
    ["Yuniverse-Setup-1.0.0.part01.bin", 20971520, "6aa26b4e3981304b2b074fae25f781679825960a8c1dad0e9068ceb99afc0306"],
    ["Yuniverse-Setup-1.0.0.part02.bin", 20971520, "75bda063749acb1eea9edbc2205cdc295e754c407532fb039955d49a0172ee01"],
    ["Yuniverse-Setup-1.0.0.part03.bin", 20971520, "7fdf360a0a212dfb2288603d5974b4e4dbfa75a4b700b5ef5a07bbdc43341bb0"],
    ["Yuniverse-Setup-1.0.0.part04.bin", 20971520, "65ba95008fc8a5519751b02560e59042288239c128cd2b3e5ed109d476a2700c"],
    ["Yuniverse-Setup-1.0.0.part05.bin", 20971520, "85e84a1d1a20d561284087cf73d9af4e5b3b5e4f73cb7f1020ab068b38233a69"],
    ["Yuniverse-Setup-1.0.0.part06.bin", 20971520, "a7f6477548cca006412be341f7ebece0fbfc86e3048d96a633f651bdc91ecfa2"],
    ["Yuniverse-Setup-1.0.0.part07.bin", 20971520, "fb22dfb90ac06f4360a3d94c0655b83b549fe7a7cc01fa8a3ae00f35cfef9865"],
    ["Yuniverse-Setup-1.0.0.part08.bin", 9826662, "8fc09411528e1176a3e7302200462782bcedbbdbd6658e9a2e6e759529eb0d64"]
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
  const response = await fetch(`/downloads/${name}`, { cache: "no-store" });
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
