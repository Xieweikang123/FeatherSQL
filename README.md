# FeatherSQL - 轻量 SQL 客户端

一个基于 Tauri v2 + React + TypeScript 构建的跨平台桌面 SQL 客户端应用。

## 功能特性

### MVP 功能

- ✅ **连接管理**
  - 创建、编辑、删除数据库连接配置
  - 支持 SQLite（文件路径选择）
  - 预留 MySQL/PostgreSQL 配置字段（host/port/user/password/database/ssl）
  - 连接配置本地存储（使用 tauri-plugin-store）
  - 密码字段安全提示（当前为明文存储，请注意安全）

- ✅ **SQL 编辑器**
  - 基于 CodeMirror 6 的 SQL 编辑器
  - SQL 语法高亮
  - 快捷键支持：`Ctrl/Cmd + Enter` 执行 SQL
  - 深色主题

- ✅ **查询结果展示**
  - 表格形式展示查询结果
  - 支持横向滚动（列数较多时）
  - 错误信息友好提示

- ✅ **基础界面**
  - 顶部栏：应用标题 + 当前连接状态指示器
  - 左侧边栏：连接列表 + 新建连接按钮
  - 主区域：SQL 编辑器 + 结果表格
  - 右下角：日志/错误输出区域（可折叠）

## 技术栈

### 前端
- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **UI 框架**: Tailwind CSS
- **编辑器**: CodeMirror 6
- **状态管理**: Zustand
- **组件库**: Radix UI（基础组件）

### 后端
- **框架**: Tauri v2
- **数据库插件**: tauri-plugin-sql (支持 SQLite，预留 MySQL/PostgreSQL)
- **存储插件**: tauri-plugin-store（连接配置存储）
- **语言**: Rust

## 系统要求

### 开发环境
- Node.js 18+ 
- Rust 1.70+ (安装: https://www.rust-lang.org/tools/install)
- 系统依赖（根据平台）:
  - **Windows**: Microsoft Visual C++ Build Tools
  - **macOS**: Xcode Command Line Tools
  - **Linux**: 
    - `libwebkit2gtk-4.0-dev`
    - `build-essential`
    - `curl`
    - `wget`
    - `libssl-dev`
    - `libgtk-3-dev`
    - `libayatana-appindicator3-dev`
    - `librsvg2-dev`

### 运行时
- Windows 10/11
- macOS 10.15+
- Linux (主流发行版)

## 开发运行

### 安装依赖

```bash
# 安装前端依赖
npm install

# Rust 依赖会在首次构建时自动下载
```

### 开发模式

```bash
npm run tauri dev
```

这将启动开发服务器，并自动打开应用窗口。

### 构建生产版本

```bash
npm run tauri build
```

构建产物位于 `src-tauri/target/release/` 目录。

## 支持的数据库

### 当前支持
- **SQLite**: 通过文件路径连接

### 预留支持（配置已就绪，需要启用相应特性）
- **MySQL**: 需要启用 `tauri-plugin-sql` 的 `mysql` 特性
- **PostgreSQL**: 需要启用 `tauri-plugin-sql` 的 `postgres` 特性

### 启用 MySQL/PostgreSQL 支持

在 `src-tauri/Cargo.toml` 中修改：

```toml
[dependencies]
tauri-plugin-sql = { version = "2.0", features = ["sqlite", "mysql", "postgres"] }
```

然后重新构建项目。

## 项目结构

```
FeatherSQL/
├── src/                          # 前端代码
│   ├── components/               # React 组件
│   │   ├── ConnectionManager.tsx # 连接管理组件
│   │   ├── ConnectionForm.tsx   # 连接表单对话框
│   │   ├── SqlEditor.tsx        # SQL 编辑器
│   │   └── ResultTable.tsx       # 结果表格组件
│   ├── lib/                     # 工具函数
│   │   ├── utils.ts             # 通用工具
│   │   └── commands.ts          # Tauri 命令封装
│   ├── store/                   # 状态管理
│   │   └── connectionStore.ts   # 连接状态管理
│   ├── App.tsx                  # 主应用组件
│   ├── main.tsx                 # 入口文件
│   └── index.css                # 全局样式
├── src-tauri/                    # Tauri 后端
│   ├── src/
│   │   ├── main.rs              # 主入口，注册插件和命令
│   │   ├── db/
│   │   │   ├── mod.rs           # 数据库模块导出
│   │   │   ├── connections.rs   # 连接管理逻辑
│   │   │   └── execute.rs        # SQL 执行逻辑
│   │   └── storage/
│   │       └── mod.rs            # 存储模块
│   ├── Cargo.toml               # Rust 依赖配置
│   └── tauri.conf.json          # Tauri 配置文件
├── package.json                  # 前端依赖
├── tsconfig.json                # TypeScript 配置
├── vite.config.ts               # Vite 配置
├── tailwind.config.js           # Tailwind 配置
└── README.md                    # 项目文档
```

## 使用说明

### 创建连接

1. 点击左侧边栏的 "新建连接" 按钮
2. 填写连接信息：
   - **SQLite**: 选择数据库文件路径
   - **MySQL/PostgreSQL**: 填写主机、端口、用户名、密码、数据库名等信息
3. 点击 "保存"

### 执行 SQL

1. 在左侧连接列表中选择一个连接
2. 在 SQL 编辑器中输入 SQL 语句
3. 点击 "执行" 按钮或按 `Ctrl/Cmd + Enter`
4. 查看下方结果表格中的查询结果

### 查看日志

点击底部 "日志" 面板可以查看操作日志和错误信息。

## 后续路线图

- [ ] SQL 查询历史记录
- [ ] 多标签页支持（多个 SQL 编辑器）
- [ ] 导出查询结果为 CSV/JSON
- [ ] 数据库 Schema 浏览器
- [ ] SQL 自动补全
- [ ] 查询结果分页
- [ ] 连接密码加密存储
- [ ] 主题切换（浅色/深色）
- [ ] 快捷键自定义
- [ ] 查询性能分析

## 开发注意事项

### 连接配置存储

连接配置存储在应用数据目录的 `connections.json` 文件中（通过 tauri-plugin-store 管理）。

**安全提示**: 当前版本的密码以明文形式存储。在生产环境中使用前，请实现密码加密功能。

### SQL 执行安全

当前版本允许执行任意 SQL 语句。在生产环境中，建议：
- 添加 SQL 语句白名单/黑名单
- 实现 SQL 审计日志
- 限制危险操作（DROP、DELETE 等）

### 错误处理

- SQL 执行错误会显示在错误面板中
- 连接错误会记录在日志中
- 所有错误信息都会在日志面板中显示

## 故障排除

### 编译错误

如果遇到 Rust 编译错误：
1. 确保 Rust 版本 >= 1.70: `rustc --version`
2. 更新 Rust: `rustup update`
3. 清理构建缓存: `cd src-tauri && cargo clean`

### 插件加载失败

如果 tauri-plugin-sql 加载失败：
1. 检查 `src-tauri/Cargo.toml` 中的插件版本
2. 确保已启用正确的特性（如 `sqlite`）
3. 查看 Tauri 控制台错误信息

### 前端构建错误

如果前端构建失败：
1. 删除 `node_modules` 和 `package-lock.json`
2. 重新安装: `npm install`
3. 检查 Node.js 版本 >= 18

## 许可证

本项目为示例项目，可根据需要选择合适的许可证。

## 贡献

欢迎提交 Issue 和 Pull Request！

