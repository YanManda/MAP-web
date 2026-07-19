# WR3 流域归趋实验台

一个完全在浏览器中运行的 WR3 农药环境归趋模型页面。使用者上传 `ParaWR3.xlsx` 后，页面通过 Pyodide 执行原始 Python 算法，展示年度质量趋势、介质平均浓度与主要通量，并生成完整的 `Env_results.xlsx`。

## 本地预览

静态页面需要通过 HTTP 访问，不能直接双击 `index.html`：

```bash
python3 -m http.server 8000
```

然后打开 <http://localhost:8000>。

## 发布到 GitHub Pages

1. 在 GitHub 创建仓库并将本目录推送到 `main` 分支。
2. 进入仓库的 **Settings → Pages**。
3. 在 **Build and deployment** 中选择 **GitHub Actions**。
4. 等待 `Deploy static site to GitHub Pages` 工作流完成。

页面不会上传参数工作簿；Python、NumPy、pandas 与 openpyxl 均在使用者浏览器内运行。首次计算需要联网加载 Pyodide 运行环境。
