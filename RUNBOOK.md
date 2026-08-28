# image-studio 运维手册

> 复制粘贴用。命令按**在哪台机器跑**分组，别搞混。

## 两台机器

| 标记 | 是什么 | 提示符 | `~` 指向 |
|---|---|---|---|
| 🖥️ **服务器** | 腾讯云控制台的网页终端 OrcaTerm（本地 SSH 连不上这台） | `ubuntu@VM-0-2-ubuntu:~$` | `/home/ubuntu` |
| 💻 **本机** | Windows PowerShell | `PS D:\code\image-studio>` | `C:\Users\金锁` |

- 服务器：腾讯云香港轻量 `43.161.248.173`，2 核 2GB，Ubuntu 24.04，用户 `ubuntu`
- 域名：`picflowlab.cn`（Nginx 反代 + 静态托管；后端 systemd 服务 `image-studio-backend`，uvicorn 跑在 `127.0.0.1:8001`）
- 代码仓库：GitHub `jinsuo199302-sketch/image-studio`（remote 名 `github`，主用）／Gitee `origin`（备用，服务器连不上 Gitee）
- 部署路径：`~/image-studio`

---

## 一、发布新代码到线上

### 💻 本机（PowerShell，目录 `D:\code\image-studio`）

```powershell
cd D:\code\image-studio
npm.cmd run build
git add -A
git commit -m "说明这次改了啥"
git push github main
```

> `npm.cmd` 不是笔误——PowerShell 默认禁 `.ps1`。执行过下面「一次性设置」的话可以直接写 `npm`。
> build 通过 = `vue-tsc` 类型检查 + 打包都没报错，才推。

### 🖥️ 服务器（OrcaTerm）

```bash
cd ~/image-studio && git pull
```

然后**按这次改了什么**选：

```bash
# 只改了前端（src/ 下）
npm run build

# 只改了后端（backend/ 下）或加了 public/ 静态资源
sudo systemctl restart image-studio-backend

# 前端后端都改了（很常见）—— 两条都要
npm run build && sudo systemctl restart image-studio-backend

# 如果这次动了 backend/requirements.txt（加了 Python 依赖）—— venv 在 backend/venv/，不是仓库根
cd ~/image-studio/backend && venv/bin/python -m pip install -r requirements.txt && sudo systemctl restart image-studio-backend
```

### 验证（🖥️ 服务器）

```bash
curl -s https://picflowlab.cn/ | grep -oE 'src="[^"]*\.js"'
```

拿到的 bundle 名要和本机 `npm run build` 输出的 `dist/assets/index-XXXX.js` 一致。
一致但页面还是旧的 → 浏览器缓存，`Ctrl+Shift+R` 硬刷或用无痕窗口。

---

## 二、本机跑「不限版」后端（处理 LoRA 数据、随便测改字用）

线上一直是收紧的（拦身份证/发票等敏感文件）。要不受限地处理数据，就在本机开一个 `DEV_UNRESTRICTED=1` 的后端。

### 一次性设置

**PowerShell 执行策略**（只做一次，之后 `npm` / git 钩子都能跑）：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**建本机 `D:\code\image-studio\backend\.env`**（这个文件已 gitignore，不会被提交）：

1. 🖥️ 服务器上 `cat ~/image-studio/backend/.env`，复制 `OPENLUX_BASE_URL=` 和 `OPENLUX_API_KEY=` 两行
2. 💻 本机 `notepad D:\code\image-studio\backend\.env`，新建，写入：

```
OPENLUX_BASE_URL=<从服务器抄>
OPENLUX_API_KEY=<从服务器抄>
DEV_UNRESTRICTED=1
```

### 每次要用时（💻 本机，两个窗口都别关）

窗口 1 — 后端：
```powershell
cd D:\code\image-studio\backend
venv\Scripts\python.exe run.py
```
启动日志出现一排 `!!!!!!` + `[DEV_UNRESTRICTED] 内容安全检查已全部关闭` = 生效。

窗口 2 — 前端：
```powershell
cd D:\code\image-studio
npm run dev
```
浏览器开它给的地址（通常 `http://localhost:5173/`）→ 登录 → 用。

用完 `Ctrl+C` 关掉两个窗口即可。**`DEV_UNRESTRICTED=1` 只在本机 `.env` 里，永远不要加到服务器。**

---

## 三、确认线上是收紧状态

🖥️ 服务器：

```bash
grep -iE "DEV_UNRESTRICTED|DISABLE_SENSITIVE" ~/image-studio/backend/.env
sudo journalctl -u image-studio-backend -n 50 --no-pager | grep -iE "DEV_UNRESTRICTED|!!!!"
```

两条命令都**没有输出** = 线上安全检查正常开着。有输出就去 `.env` 删掉那行再 `sudo systemctl restart image-studio-backend`。

---

## 四、排障速查

| 症状 | 先做什么 |
|---|---|
| 后端接口报错、看不出原因 | 🖥️ `sudo journalctl -u image-studio-backend -n 40 --no-pager` |
| `git pull` 冲突 | 多半是 `dist/` 或构建产物被 git 跟踪了，把报错发出来 |
| 部署后页面没变 | 先 `curl ... grep .js` 对 bundle 名；一致就是浏览器缓存，硬刷 |
| 抠图第一次特别慢/超时 | isnet 模型首次下载 178MB，等它下完，之后就快（缓存在 `~/.u2net/`） |
| 老照片上色第一次特别慢/超时 | 上色模型首次下载 ~255MB（GitHub release），缓存在 `~/.cache/image-studio-colorize/`；部署后建议手动预热一次（见下） |
| 本机改了后端代码不生效 | 杀掉所有 python 进程重启，别信 uvicorn `--reload`：`Get-Process python* \| Stop-Process -Force` 再 `run.py` |
| `npm` 报「禁止运行脚本」 | 用 `npm.cmd`，或执行上面的 `Set-ExecutionPolicy` |
| `findstr` / `cat` 在 PowerShell 里找不到 | 那是给 🖥️ 服务器跑的命令，别在 💻 本机敲 |

---

## 五、抠图边缘档位（改完这块可能要调参考）

- 代码：`backend/app/bg_removal_worker.py`，模型 `isnet-general-use`
- `soft`（默认，万能画图）：轻收紧，留发丝
- `hard`（证件照/遗像/贴纸生成）：trimap + 收边 + 边缘去色，照相馆硬边
- 前端传 `edge` 参数控制；万能画图有「自然/锐利」切换

---

## 六、老照片上色

- 代码：`backend/app/colorize_worker.py`（子进程跑，跟抠图同一套隔离方式），端点 `POST /api/ai/colorize`
- 模型：DeOldify 的 ONNX 导出版，走 `onnxruntime` CPU——**没加新 Python 依赖**（onnxruntime/opencv/numpy 都是项目已装的）
- `deoldify.onnx`（255MB）首次调用从 GitHub release 现场下载，缓存到 `~/.cache/image-studio-colorize/`
- 内部固定 256×256 推理（~0.5s），只取色度、亮度用原图——脸部细节不动
- 只依赖本地推理，**不调 openlux、不接敏感文件检测**（上色是还原不是篡改，跟扫描件同定性）
- 部署后预热（🖥️ 服务器，避免线上第一个用户干等下载）：

```bash
cd ~/image-studio/backend
venv/bin/python -c "from PIL import Image; Image.new('RGB',(64,64)).save('/tmp/_c.jpg')"
venv/bin/python -m app.colorize_worker 1.0 < /tmp/_c.jpg > /dev/null && echo '上色模型已缓存'
```
