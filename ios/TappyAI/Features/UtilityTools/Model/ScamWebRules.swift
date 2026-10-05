// GENERATED from the Web `src/lib/scam-shield/message/rules.ts` (origin/p7/web-subscription) by ios/scripts/gen_scam_web_rules.py.
// Do not edit by hand: regenerate. Patterns run on the lower-cased, diacritic-stripped message.
import Foundation

enum ScamWebRules {
    struct Rule { let type: String; let severity: String; let weight: Int; let negatable: Bool; let patterns: [String] }

    static let rules: [Rule] = [
        Rule(type: "account_suspension_threat", severity: "high", weight: 25, negatable: false, patterns: [
            #"(tai khoan|account|acc)\b.{0,60}?(bi khoa|khoa|dinh chi|tam ngung|vo hieu|bi xoa|bi han che|bi thu hoi)"#,
            #"(khoa|dinh chi|tam ngung|vo hieu hoa|xoa|thu hoi).{0,40}?tai khoan"#,
            #"(account|profile|access).{0,60}?(locked|suspended|blocked|disabled|terminated|deactivated|restricted|deleted|closed)"#,
            #"(suspend|lock|block|disable|terminate|deactivate|restrict|delete|close)\w*.{0,30}?(your )?(account|profile|access)"#,
            #"(账户|账号|帐号|帐户).{0,20}?(冻结|封禁|锁定|停用|封号|注销|限制)"#,
            #"(冻结|封禁|锁定|停用|注销|限制).{0,10}?(账户|账号|帐号|帐户)"#,
        ]),
        Rule(type: "fake_security_alert", severity: "medium", weight: 15, negatable: false, patterns: [
            #"(rui ro cao|trang thai rui ro|nguy co cao|high[- ]risk|bat thuong|dang nhap la|unusual (activity|login|sign-?in)|suspicious (activity|login|sign-?in)|security (alert|warning|notice)|canh bao bao mat|异常登录|安全警告|风险状态|异常活动|高风险)"#,
        ]),
        Rule(type: "urgency_pressure", severity: "medium", weight: 15, negatable: false, patterns: [
            #"(trong vong|within|in the next|in) \d+ ?(gio|phut|ngay|h\b|hours?|hrs|minutes?|mins?|days?)"#,
            #"\b(12|24|48|72) ?(gio|h\b|hours?|tieng)"#,
            #"(ngay lap tuc|ngay bay gio|ngay hom nay|immediately|right now|right away|khan cap|urgent(ly)?|het han|expires?( today| soon| in)?|last chance|co hoi cuoi|truoc khi qua muon|限时|立即|马上|尽快|紧急|小时内|分钟内|今日内|逾期)"#,
        ]),
        Rule(type: "verify_phone_request", severity: "high", weight: 20, negatable: false, patterns: [
            #"(xac (thuc|minh|nhan)|verify|verification|confirm|cap nhat|update|re-?verify).{0,40}?(so dien thoai|sdt|phone number|mobile number|phone|手机号|电话号码)"#,
            #"(so dien thoai|sdt|phone number|mobile number|手机号|电话号码).{0,30}?(xac (thuc|minh|nhan)|verify|verification|验证)"#,
        ]),
        Rule(type: "verify_account_request", severity: "medium", weight: 15, negatable: false, patterns: [
            #"(xac (thuc|minh|nhan)|verify|verification|confirm|validate|re-?verify|cap nhat|update|kyc).{0,40}?(tai khoan|danh tinh|thong tin|account|identity|information|details|账户|账号|身份|信息)"#,
            #"(bat dau|start|begin|proceed to|tien hanh) (xac (thuc|minh|nhan)|verification|verifying)"#,
            #"(验证|认证|核实).{0,10}?(账户|账号|身份|信息)"#,
        ]),
        Rule(type: "otp_request", severity: "high", weight: 30, negatable: true, patterns: [
            #"(nhap|cung cap|gui|doc|cho .{0,12}biet|chia se|xac nhan|enter|provide|send|share|reply with|tell (us|me)|input|type|submit|输入|提供|发送|告知|回复).{0,40}?(\botp\b|ma otp|ma xac (thuc|nhan|minh)|ma bao mat|ma code|verification code|security code|one[- ]time (code|password|pin)|login code|auth(entication)? code|2fa code|验证码|校验码|动态码)"#,
            #"(\botp\b|ma otp|ma xac (thuc|nhan|minh)|verification code|security code|login code|验证码).{0,30}?(nhap|cung cap|gui|cho .{0,12}biet|chia se|enter|provide|send|share|reply|输入|提供|发送|回复)"#,
        ]),
        Rule(type: "password_request", severity: "high", weight: 25, negatable: true, patterns: [
            #"(nhap|cung cap|gui|xac nhan|cap nhat|enter|provide|send|confirm|update|输入|提供).{0,30}?(mat khau|password|passwd|\bpass\b|密码)"#,
            #"(mat khau|password|密码).{0,30}?(nhap|cung cap|gui|enter|provide|send|输入|提供)"#,
        ]),
        Rule(type: "pin_request", severity: "high", weight: 25, negatable: true, patterns: [
            #"(nhap|cung cap|gui|enter|provide|send|输入|提供).{0,30}?(\bpin\b|ma pin|pin code|支付密码)"#,
        ]),
        Rule(type: "transfer_request", severity: "high", weight: 20, negatable: false, patterns: [
            #"(chuyen (khoan|tien)|chuyen ngay|thanh toan (ngay|truoc|phi)|nop (tien|phi)|dong (phi|tien)|transfer|wire|pay(ment)? (now|first|a fee|the fee)|send money|deposit|phi (xu ly|bao hiem|van chuyen|mo khoa|giai ngan|kich hoat|hai quan)|(processing|unlock|release|activation|insurance|shipping|customs|handling) fee|转账|汇款|付款|缴费|手续费|保证金)"#,
        ]),
        Rule(type: "payment_request", severity: "medium", weight: 12, negatable: false, patterns: [
            #"(so tai khoan|\bstk\b|bank account|account number|account no|银行卡号|收款账户)"#,
            #"(vietcombank|techcombank|mb ?bank|vietinbank|bidv|agribank|\bacb\b|tpbank|vpbank|sacombank|momo|zalopay|vnpay)\b.{0,30}?\d{6,}"#,
        ]),
        Rule(type: "crypto_request", severity: "high", weight: 20, negatable: false, patterns: [
            #"(\busdt\b|bitcoin|\bbtc\b|\beth\b|ethereum|binance|okx|bybit|tether|dia chi vi|wallet address|vi (dien tu|crypto|tien ao)|tien ao|tien dien tu|crypto|钱包地址|虚拟币|加密货币|泰达币)"#,
        ]),
        Rule(type: "remote_access_request", severity: "high", weight: 25, negatable: false, patterns: [
            #"(teamviewer|anydesk|ultraviewer|quick ?support|chia se man hinh|screen ?shar\w*|remote (access|control|desktop|support)|dieu khien tu xa|truy cap tu xa|ho tro tu xa|远程控制|屏幕共享|远程协助)"#,
        ]),
        Rule(type: "app_install_request", severity: "high", weight: 20, negatable: false, patterns: [
            #"(cai dat|cai app|tai (ve|app|ung dung|xuong)|install|download).{0,40}?(app|ung dung|apk|phan mem|application|software|file|tep|link)"#,
            #"\.apk\b"#,
            #"(安装|下载).{0,10}?(应用|软件|app|程序)"#,
        ]),
        Rule(type: "reward_bait", severity: "medium", weight: 15, negatable: false, patterns: [
            #"(trung thuong|trung giai|giai thuong|phan thuong|qua tang|voucher|tri an|chuc mung ban|congratulations|you('ve| have)? (been selected|won)|winner|prize|reward|gift ?card|free (gift|money|iphone)|lucky|may man|nhan qua|nhan thuong|中奖|恭喜|奖品|奖金|礼品|免费领取)"#,
        ]),
        Rule(type: "investment_promise", severity: "medium", weight: 20, negatable: false, patterns: [
            #"(loi nhuan|lai suat|sinh loi|dau tu|investment|invest|profit|guaranteed (return|profit|income)|cam ket loi nhuan|hoa hong|passive income|thu nhap thu dong|kiem tien (online|tai nha)|earn money|make money|收益|回报|稳赚|投资|利润|理财|日息|月息)"#,
            #"\d+ ?% ?(\/|moi|per|1|a) ?(ngay|tuan|thang|day|week|month)"#,
        ]),
        Rule(type: "fake_legal_notice", severity: "high", weight: 20, negatable: false, patterns: [
            #"(lenh bat|trat|khoi to|truy na|vi pham phap luat|lien quan (den |toi )?(vu an|duong day)|rua tien|money laundering|arrest warrant|legal (action|notice)|lawsuit|court (order|summons)|toa an|vien kiem sat|co quan dieu tra|co quan cong an|bo cong an|cong an (thanh pho|tinh|quan|huyen|phuong)|hinh su|涉嫌|逮捕|洗钱|法院传票|立案|通缉|公安局|检察院)"#,
        ]),
        Rule(type: "fake_customer_support", severity: "medium", weight: 12, negatable: false, patterns: [
            #"(bo phan (ho tro|cham soc|cskh|ky thuat)|\bcskh\b|tong dai|customer (support|service|care)|help ?desk|support team|technical support|he thong (thong bao|phat hien|ghi nhan|hien thi|canh bao)|system (detected|shows|has detected|notification|alert)|客服|专员|系统(检测|显示|提示))"#,
        ]),
        Rule(type: "platform_switch_request", severity: "medium", weight: 12, negatable: false, patterns: [
            #"(ket ban|add|them|lien he|nhan tin|chat|inbox|ib)\s?(qua|vao|tren|voi|on|via|me on|us on)?\s?(zalo|telegram|whatsapp|viber|messenger|signal|line|wechat|imess)"#,
            #"(contact|message|chat|reach|add|text|dm) (me |us )?(on|via|through) (zalo|telegram|whatsapp|viber|signal|line|wechat)"#,
            #"(zalo|telegram|whatsapp|viber):? ?(\+?\d[\d ]{7,}|@\w+)"#,
            #"(加我?微信|加(我)?(qq|telegram|whatsapp)|私聊)"#,
        ]),
        Rule(type: "link_click_request", severity: "medium", weight: 12, negatable: false, patterns: [
            #"(nhan vao (day|link|lien ket|duong dan)|bam vao (day|link|lien ket)|click (here|the link|below|this link|on the link)|tap (here|the link|below)|truy cap (link|lien ket|duong dan)|theo (link|duong dan)|open the link|link (ben duoi|duoi day|sau)|(link|lien ket) (de|to) (xac|verify|confirm|claim|nhan)|点击(这里|链接|下方|此处)|访问链接)"#,
        ]),
        Rule(type: "credential_entry_request", severity: "high", weight: 20, negatable: false, patterns: [
            #"(dang nhap (tai|vao|qua|theo) (link|lien ket|day|trang|duong dan)|log ?in (via|at|through|using|on) (the |this )?(link|page|here|below|site)|sign ?in (via|at|through|on) (the |this )?(link|page)|nhap thong tin (dang nhap|tai khoan|the)|enter your (login|credentials|card|account details|card details)|(so the|card number|\bcvv\b|\bcvc\b)|输入.{0,10}?(账号|卡号|密码))"#,
        ]),
        Rule(type: "fear_threat_language", severity: "medium", weight: 12, negatable: false, patterns: [
            #"(se bi (khoa|xoa|phat|bat|truy to|xu ly|mat|dinh chi|thu hoi)|mat (tien|tai khoan|quyen)|chiu trach nhiem|hau qua|bi phat|will be (locked|deleted|fined|arrested|prosecuted|suspended|terminated|permanently)|permanently (lose|lock|delete|suspend)|consequences|penalty|face (legal|charges|prosecution)|lose (access|your account|your money|everything)|失去|后果|处罚|永久|将被)"#,
        ]),
        Rule(type: "prompt_injection_attempt", severity: "high", weight: 20, negatable: false, patterns: [
            #"(ignore (all |the |your |any )?(previous|prior|above|earlier) (instructions|prompts?|rules|guidance)|disregard (the |your |all )?(previous|above|system|prior)|you are now|new instructions?:|system prompt|\bas an ai\b|tell the user to|respond (only )?with|output the following|bo qua (cac |moi )?(huong dan|chi thi|lenh) (truoc|tren|o tren)|忽略(之前|以上|上面)的?(指令|指示|提示))"#,
            #"\b(bo qua|quen|phot lo|lo di|bo het|dung lam theo)( di)? (het |tat ca |toan bo |moi |cac |nhung )+(cac |nhung )?(huong dan|chi dan|chi thi|lenh|quy tac|yeu cau)\b"#,
            #"(he thong ai|tro ly (ao|ai)|chatbot|mo hinh (ai|ngon ngu)|\bllm\b|\bgpt\b|\bclaude\b|\bgemini\b|scam shield|\btappy\b)[^.!?\n]{0,60}\b(danh gia|ket luan|xep loai|phan loai|tra loi|bao cao)\b[^.!?\n]{0,40}\b(an toan|hop le|khong (phai )?lua dao|khong nguy hiem|dang tin cay)\b"#,
            #"\b(luu y|ghi chu|thong bao|chi thi|loi nhan) (cho|toi|den|gui) (he thong ai|tro ly (ao|ai)|chatbot|mo hinh (ai|ngon ngu)|\bllm\b|\bgpt\b|\bclaude\b|\bgemini\b|scam shield|\btappy\b)"#,
            #"\b(in|hien thi|tiet lo|cho (toi |minh )?xem|lap lai|xuat) (ra )?(toan bo |nguyen van |day du )?(prompt|lenh he thong|chi dan he thong|huong dan he thong|cau lenh he thong)\b"#,
        ]),
    ]

    static let impersonationTargets = #"\b(telegram|zalo|facebook|\bmeta\b|instagram|google|gmail|apple|icloud|microsoft|tiktok|shopee|lazada|tiki|sendo|momo|zalopay|vnpay|viettel ?pay|vietcombank|\bvcb\b|techcombank|\btcb\b|mb ?bank|\bmbb\b|bidv|vietinbank|agribank|\bacb\b|tpbank|vpbank|sacombank|\bocb\b|\bhdbank\b|\bshb\b|\bmsb\b|ngan hang|bank|cong an|police|toa an|vien kiem sat|cuc thue|tong cuc thue|thue|bao hiem xa hoi|\bbhxh\b|chinh phu|dien luc|\bevn\b|vnpt|viettel|mobifone|vinaphone|giao hang|ghtk|viettel post|vnpost|j&t|j and t|grab|be\b|dhl|fedex|ups\b|amazon|netflix|paypal|visa|mastercard|公安|警察|法院|检察院|税务|海关|银行|快递|淘宝|支付宝|微信)"#
    static let negationWords = #"(khong|dung|never|not|don't|do not|won't|will not|shouldn't|no one|nobody|不要|切勿|勿|绝不|不会)"#
    static let conditionalBefore = #"(\bneu\b|\bif\b|\bunless\b|truong hop|如果|若)\s*[a-z ]{0,10}$"#
}
