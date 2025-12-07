# AI 登录检测调试器

开发工具 - 用于调试和验证 AI 网站的登录检测逻辑。通过对比登录前后的 Cookie 差异，精准定位登录 Cookie。

## 功能特点

- 🍪 **三步对比法**：记录未登录 → 手动登录 → 记录已登录，对比差异
- 📊 **三类变化检测**：新增 Cookie、值变化 Cookie、删除的 Cookie
- 💾 **自动保存**：分析结果自动保存到浏览器 localStorage
- 📥 **批量导出**：一键导出所有站点配置为 `sites.json`

## 安装

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的 **"开发者模式"**
3. 点击 **"加载已解压的扩展程序"**
4. 选择 `chrome-extension` 文件夹

## 使用流程

### 分析登录 Cookie

1. 访问一个 AI 网站（如 doubao.com, tongyi.aliyun.com 等）
2. **确保处于未登录状态**（如有必要先登出）
3. 点击扩展图标打开调试面板
4. 点击 **"📷 记录未登录 Cookie"**
5. 在网站上完成登录操作
6. 点击 **"📷 记录已登录 Cookie"**
7. 查看差异分析结果：
   - ✅ **新增 Cookie** - 登录后新出现的（很可能是登录凭证）
   - 🔄 **值变化 Cookie** - 登录前后值不同的
   - ❌ **删除 Cookie** - 登录后消失的

### 保存配置

1. 完成分析后，点击 **"💾 保存此站点"** 按钮
2. 配置将保存到浏览器存储中
3. 在"已保存的站点配置"区域可以查看、复制或删除

### 导出配置

1. 点击 **"📥 导出 sites.json"** 按钮
2. 下载包含所有保存站点的 JSON 文件
3. 将内容合并到项目的 `sites.json` 中

## 配置文件

站点配置保存在 `sites.json` 文件中，格式如下：

```json
{
  "version": "1.0.0",
  "sites": [
    {
      "id": "站点ID",
      "name": "显示名称",
      "icon": "🤖",
      "url": "https://example.com/",
      "domains": ["example.com", ".example.com"],
      "cookieRules": {
        "authIndicators": [
          {
            "name": "session",
            "loggedInValues": null,
            "loggedOutValues": null
          }
        ],
        "anyOf": true,
        "excludeCookies": ["tracking_id"]
      },
      "enabled": true
    }
  ]
}
```

### 配置说明

| 字段 | 说明 |
|------|------|
| `id` | 站点唯一标识（英文） |
| `name` | 显示名称 |
| `icon` | Emoji 图标 |
| `url` | 站点主页 URL |
| `domains` | 用于 Cookie 匹配的域名列表 |
| `cookieRules.authIndicators` | 需要检测的 Cookie 配置（支持对象格式 `{name, loggedInValues, loggedOutValues}` 或 字符串） |
| `cookieRules.anyOf` | `true`: 任一匹配即登录; `false`: 全部匹配才登录 |
| `cookieRules.excludeCookies` | 排除的 Cookie（不用于判断登录状态） |
| `enabled` | 是否启用该站点 |

## 添加新站点

1. 访问目标网站（确保未登录）
2. 打开扩展，完成三步对比分析
3. 点击"💾 保存此站点"
4. 或者复制"生成的配置"到 `sites.json` 的 `sites` 数组中
5. 重新加载扩展

## API（用于 Tauri 集成）

扩展支持通过 `chrome.runtime.sendMessage` 进行通信：

```javascript
// 获取所有站点登录状态
{ type: 'GET_LOGIN_STATES' }

// 刷新所有站点
{ type: 'REFRESH_ALL' }

// 添加新站点
{ type: 'ADD_SITE', site: {...} }

// 导出配置
{ type: 'EXPORT_CONFIG' }

// 导入配置
{ type: 'IMPORT_CONFIG', config: {...} }
```

## 文件结构

```
chrome-extension/
├── manifest.json     # 扩展配置
├── background.js     # 后台服务
├── popup.html/js/css # 调试界面
├── sites.json        # 站点配置（可编辑）
├── icons/            # 扩展图标
└── README.md         # 本文档
```
