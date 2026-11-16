# 幼儿园切水果课堂版

2026-11-16：用户已确认四步可玩原型，并允许本地游戏使用浏览器摄像头。

目标：4 岁孩子轮流玩，笔记本投屏，15–20 分钟。先看到真实手部关键点，再加轨迹、一个水果、三个水果。大水果缓慢漂浮，不设炸弹、惩罚或倒计时。切换下一位时可暂停、重置。

界面和教学步骤沿用已确认原型；展示的是提前准备的增量版本，不假装现场生成代码。AI 仅估计手部位置。相机画面不上传、不存储，模型与运行资源随包提供。鼠标模式明确标记为非 AI。

分工：主代理负责 index.html、styles.css、app.js、scene.js、game.js、交互测试与集成；camera 工作流独占 camera.js、camera.test.js、vendor/、models/、THIRD_PARTY_NOTICES.md；课堂文档工作流独占 LESSON.md、启动课堂.command、serve.py、package-classroom.py。

验证：游戏碰撞/暂停与失去手势的单元测试；摄像头启动/取消/关闭测试；真实浏览器鼠标四步、摄像头实际启动和推理、切换与再进入；本地资源完整性与离线包解压运行。

原版来源：https://github.com/Axwathy/Zlice ，MIT，基线 c3a90ead8a1274c4a49342cc90d9f5f648eca61d。

不涉及后端 API 或持久用户数据，因此不需要服务器交互图或数据迁移。
