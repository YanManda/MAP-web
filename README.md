# MAP环境归趋模拟平台V1.0

纯静态在线模拟平台，支持6介质和9介质模型，无需注册或登录。用户上传的参数文件和计算结果在浏览器本地处理，不发送至账户或计算服务器。

## 用户如何打开和运行

**在线入口：[打开MAP环境归趋模拟平台](https://yanmanda.github.io/MAP-web/)**

这是网站地址，不是GitHub代码仓库地址。部署成功后，用户直接在浏览器打开上述链接即可使用，**不需要下载项目、不需要安装Python或Node.js、不需要打开PowerShell或启动本地服务**，网站维护者的电脑也无需保持开机。

### 使用环境

- 推荐使用电脑端近期版本的Microsoft Edge或Google Chrome，并允许JavaScript、WebAssembly和Web Worker运行。手机屏幕可以查看页面，但大数据模拟建议使用电脑。
- 需要联网。首次计算会下载Pyodide运行环境及NumPy、pandas、openpyxl等依赖，加载时间取决于网络；能打开首页不代表这些计算资源一定能加载成功。
- 中国大陆不同网络访问GitHub Pages和依赖下载站点的情况可能不同，不能保证所有网络均可稳定访问。若计算环境加载失败，请检查网络与浏览器错误提示。
- 计算使用用户电脑的处理器和内存，耗时随成分、空间单元和年份数量变化。运行期间请保留该网页，不要刷新或关闭标签页。

### 操作步骤

1. 打开上方在线入口，选择对应的介质划分方案。
2. 展开示例下载区域，下载对应的`Example_9.xlsx`或`Example_6.xlsx`；模型说明见`模型原理与引用.docx`。
3. 按示例结构准备输入文件，点击“选择输入文件”。确认页面识别出的目标成分、空间单元和时间尺度。
4. 点击“开始计算”，等待运行环境加载和模型计算完成。
5. 在结果区选择目标成分，查看图表；点击“下载完整结果”保存Excel结果。

刷新或关闭页面前请下载结果，当前版本不提供云端保存、账户管理或用户使用统计。需要帮助请联系：xiaoman.yan@outlook.com。

## 维护者：GitHub Pages发布与更新

项目包含GitHub Pages发布流程 `.github/workflows/pages.yml`。将项目提交到GitHub仓库后，在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。推送到main分支或手动运行该工作流，即可发布。公开网址由工作流的部署结果给出。

工作流运行 `python build_static.py`，仅将明确列出的公共文件复制到 `_site/` 并发布。旧账户数据库 `data/`、使用统计 `stats/`、本地测试输出、原模型文件夹及申请材料不会被打包。旧数据库保留在本机，静态版本不再访问或修改它。

请勿直接将整个项目目录作为发布目录。若使用其他静态托管平台，可先运行：

```powershell
python build_static.py
```

再上传生成的 `_site` 目录。发布内容包括网页、两个Python模型、两个Excel示例、模型原理与引用Word文档和本地Excel解析库。所有网站资源使用相对路径，支持部署在仓库子路径下。

仅恢复配置不会自动把本地文件上传到GitHub；需要提交推送后触发发布。公开网站可直接使用，用户无需安装Python，你的电脑也无需持续开机。

## 开发者：本地预览（可选，普通用户无需操作）

以下命令仅供维护者修改网站时在本机预览，需要本机安装Python 3；不是在线用户的运行前提。

```powershell
python server.py
```

打开 http://127.0.0.1:8000/。这个脚本只提供静态文件，不包含账户后端，不读取旧数据库。

也可在构建完成后使用普通静态服务：

```powershell
python -m http.server 8000 --directory _site
```

本地预览仍需HTTP服务，不建议直接双击HTML文件，因为模型加载使用Worker和文件请求。

## 输入和结果

- 9介质：`MAP_WR_Media9.py` 与 `Example_9.xlsx`。
- 6介质：`MAP_WR_Media6.py` 与 `Example_6.xlsx`。
- 四张模型工作表：`Confluence_Sequence`、`Annual_para`、`Physicochemical_para`、`Application`，额外说明表可保留。
- 环境参数由 `Annual_para` 的当前年份和WR_ID读取，字段按列名索引。
- 折线图：按目标成分和年份，将所有空间单元与介质的质量加和。
- 饼图：最终年份各介质所有空间单元的质量加和，除以该年份区域残留总量。
- 通量柱状图：最终年份各空间单元同名通量直接加和，降序展示前10项，单位kg/yr。

首次计算仍需联网加载Pyodide、NumPy、pandas和openpyxl。网站静态化不会改变这部分依赖，也不会更改模型算法。
