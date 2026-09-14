export interface MermaidExample {
  id: string;
  title: string;
  category: string;
  source: string;
  diagramType: string;
  isDefault?: boolean;
  /** Localized title shown in the picker; source package title remains available for diagnostics. */
  originalTitle?: string;
  description?: string;
  /** Whether this example can render with the bundled Mermaid engine. */
  available?: boolean;
  /** Optional dependency note shown when an example needs an external extension. */
  requires?: string;
  /** Config extracted from the example front matter for the built-in config controls. */
  config?: Record<string, unknown>;
  /** Serialized config extracted from the example front matter. */
  configText?: string;
}

export interface MermaidStylePreset {
  id: 'default' | 'base' | 'dark' | 'forest' | 'neutral';
  label: string;
  theme: 'default' | 'base' | 'dark' | 'forest' | 'neutral';
}

/** Five safe theme presets exposed by Mermaid Live Editor. */
export const MERMAID_STYLE_PRESETS: MermaidStylePreset[] = [
  { id: 'default', label: '默认', theme: 'default' },
  { id: 'neutral', label: '中性', theme: 'neutral' },
  { id: 'dark', label: '深色', theme: 'dark' },
  { id: 'forest', label: '森林', theme: 'forest' },
  { id: 'base', label: '基础', theme: 'base' },
];

/** The hand-drawn toggle is a separate look choice in the reference editor. */
export const MERMAID_LOOK_OPTIONS = [
  { value: 'classic', label: '经典' },
  { value: 'handDrawn', label: '手绘' },
] as const;

export const MERMAID_EXAMPLES: MermaidExample[] = [
  {
    id: 'flowchart-v2-1',
    title: '基础流程图',
    category: '流程图',
    diagramType: 'flowchart-v2',
    isDefault: true,
    originalTitle: 'Basic Flowchart',
    description: 'Visualize flowcharts and directed graphs',
    source:
      'flowchart TD\n    A[Christmas] -->|Get money| B(Go shopping)\n    B --> C{Let me think}\n    C -->|One| D[Laptop]\n    C -->|Two| E[iPhone]\n    C -->|Three| F[fa:fa-car Car]',
  },
  {
    id: 'flowchart-v2-2',
    title: '在线结账流程',
    category: '流程图',
    diagramType: 'flowchart-v2',
    originalTitle: 'Online Checkout Flow',
    description: 'Visualize flowcharts and directed graphs',
    source:
      'flowchart TD\n    Start([Visit online store]) --> Browse[Browse products]\n    Browse --> Cart[Add items to cart]\n    Cart --> Decide{Ready to check out?}\n    Decide -->|Keep shopping| Browse\n    Decide -->|Yes| Pay[Enter payment details]\n    Pay --> Valid{Payment accepted?}\n    Valid -->|No| Retry[Show error message]\n    Retry --> Pay\n    Valid -->|Yes| Confirm[Order confirmed]\n    Confirm --> Done([Email receipt])\n\n    style Start fill:#e8f5e9,stroke:#43a047\n    style Done fill:#e8f5e9,stroke:#43a047\n    style Valid fill:#fff3e0,stroke:#fb8c00',
  },
  {
    id: 'flowchart-v2-3',
    title: '包含子图的 CI/CD 流水线',
    category: '流程图',
    diagramType: 'flowchart-v2',
    originalTitle: 'CI/CD Pipeline with Subgraphs',
    description: 'Visualize flowcharts and directed graphs',
    source:
      'flowchart LR\n    subgraph dev[Development]\n        Code[Write code] --> PR[Open pull request]\n    end\n\n    subgraph ci[Continuous Integration]\n        Build[Build] --> Test[Run tests]\n        Test --> Gate{Tests pass?}\n    end\n\n    subgraph cd[Deployment]\n        Stage[Deploy to staging] --> Approve[Manual approval]\n        Approve --> Prod[Deploy to production]\n    end\n\n    PR --> Build\n    Gate -->|Yes| Stage\n    Gate -->|No| Code',
  },
  {
    id: 'flowchart-v2-4',
    title: '扩展节点形状',
    category: '流程图',
    diagramType: 'flowchart-v2',
    originalTitle: 'Expanded Node Shapes',
    description: 'Visualize flowcharts and directed graphs',
    source:
      'flowchart TD\n    Form@{ shape: manual-input, label: "User fills in form" }\n    Docs@{ shape: docs, label: "Uploaded documents" }\n    Check@{ shape: procs, label: "Automated checks" }\n    Decision@{ shape: diam, label: "Application approved?" }\n    DB@{ shape: cyl, label: "Customer database" }\n    Letter@{ shape: stadium, label: "Send welcome email" }\n\n    Form --> Docs\n    Docs --> Check\n    Check --> Decision\n    Decision -->|Yes| DB\n    Decision -->|No| Form\n    DB --> Letter',
  },
  {
    id: 'c4-1',
    title: '网上银行系统上下文',
    category: 'C4',
    diagramType: 'c4',
    isDefault: true,
    originalTitle: 'Internet Banking System Context',
    description:
      'Visualize software architecture using the C4 model (Context, Container, Component, Code)',
    source:
      'C4Context\n    title System Context diagram for Internet Banking System\n    Enterprise_Boundary(b0, "BankBoundary0") {\n        Person(customerA, "Banking Customer A", "A customer of the bank, with personal bank accounts.")\n        Person(customerB, "Banking Customer B")\n        Person_Ext(customerC, "Banking Customer C", "desc")\n\n        Person(customerD, "Banking Customer D", "A customer of the bank, <br/> with personal bank accounts.")\n\n        System(SystemAA, "Internet Banking System", "Allows customers to view information about their bank accounts, and make payments.")\n\n        Enterprise_Boundary(b1, "BankBoundary") {\n            SystemDb_Ext(SystemE, "Mainframe Banking System", "Stores all of the core banking information about customers, accounts, transactions, etc.")\n\n            System_Boundary(b2, "BankBoundary2") {\n                System(SystemA, "Banking System A")\n                System(SystemB, "Banking System B", "A system of the bank, with personal bank accounts. next line.")\n            }\n\n            System_Ext(SystemC, "E-mail system", "The internal Microsoft Exchange e-mail system.")\n            SystemDb(SystemD, "Banking System D Database", "A system of the bank, with personal bank accounts.")\n\n            Boundary(b3, "BankBoundary3", "boundary") {\n                SystemQueue(SystemF, "Banking System F Queue", "A system of the bank.")\n                SystemQueue_Ext(SystemG, "Banking System G Queue", "A system of the bank, with personal bank accounts.")\n            }\n        }\n    }\n\n    BiRel(customerA, SystemAA, "Uses")\n    BiRel(SystemAA, SystemE, "Uses")\n    Rel(SystemAA, SystemC, "Sends e-mails", "SMTP")\n    Rel(SystemC, customerA, "Sends e-mails to")',
  },
  {
    id: 'c4-2',
    title: '网上银行容器图',
    category: 'C4',
    diagramType: 'c4',
    originalTitle: 'Internet Banking Container Diagram',
    description:
      'Visualize software architecture using the C4 model (Context, Container, Component, Code)',
    source:
      'C4Container\n    title Container diagram for Internet Banking System\n\n    Person(customer, "Banking Customer", "A customer of the bank, with personal bank accounts")\n    System_Ext(email_system, "E-Mail System", "The internal Microsoft Exchange system")\n\n    Container_Boundary(c1, "Internet Banking") {\n        Container(web_app, "Web Application", "JavaScript, React", "Delivers the static content and the SPA")\n        Container(spa, "Single-Page App", "JavaScript, React", "Provides all banking functionality via the browser")\n        Container(mobile_app, "Mobile App", "C#, Xamarin", "Provides a subset of banking functionality")\n        ContainerDb(database, "Database", "SQL Database", "Stores user registration, hashed auth credentials, access logs")\n        Container(backend_api, "API Application", "Java, Docker", "Provides banking functionality via JSON/HTTPS API")\n    }\n\n    Rel(customer, web_app, "Uses", "HTTPS")\n    Rel(customer, spa, "Uses", "HTTPS")\n    Rel(customer, mobile_app, "Uses")\n    Rel(web_app, spa, "Delivers")\n    Rel(spa, backend_api, "Makes API calls to", "JSON/HTTPS")\n    Rel(mobile_app, backend_api, "Makes API calls to", "JSON/HTTPS")\n    Rel(backend_api, database, "Reads from and writes to", "JDBC")\n    Rel(email_system, customer, "Sends e-mails to")\n    Rel(backend_api, email_system, "Sends e-mails using", "SMTP")',
  },
  {
    id: 'ishikawa-1',
    title: '鱼骨图',
    category: '鱼骨图',
    diagramType: 'ishikawa',
    isDefault: true,
    originalTitle: 'Ishikawa Diagram',
    description: 'Visualize problem and causes in fishbone',
    source:
      '\nishikawa-beta\n    Blurry Photo\n    Process\n        Out of focus\n        Shutter speed too slow\n        Protective film not removed\n        Beautification filter applied\n    User\n        Shaky hands\n    Equipment\n        LENS\n            Inappropriate lens\n            Damaged lens\n            Dirty lens\n        SENSOR\n            Damaged sensor\n            Dirty sensor\n    Environment\n        Subject moved too quickly\n        Too dark\n',
  },
  {
    id: 'ishikawa-2',
    title: '送餐延迟根因',
    category: '鱼骨图',
    diagramType: 'ishikawa',
    originalTitle: 'Late Food Delivery Root Causes',
    description: 'Visualize problem and causes in fishbone',
    source:
      '\nishikawa-beta\n    Late Food Delivery\n    Process\n        Orders batched too long\n        Kitchen queue not prioritized\n    People\n        Not enough drivers on shift\n        New cook still in training\n    Equipment\n        Oven capacity too small\n        Delivery bags lose heat\n    Environment\n        Heavy rain\n        Road construction on main route\n    Measurement\n        No alert when prep time exceeds target\n',
  },
  {
    id: 'kanban-1',
    title: 'Mermaid 冲刺看板',
    category: '看板',
    diagramType: 'kanban',
    isDefault: true,
    originalTitle: 'Mermaid Sprint Board',
    description: 'Visualize work items in a Kanban board',
    config: { kanban: { ticketBaseUrl: 'https://github.com/mermaid-js/mermaid/issues/#TICKET#' } },
    configText:
      '{\n  "kanban": {\n    "ticketBaseUrl": "https://github.com/mermaid-js/mermaid/issues/#TICKET#"\n  }\n}',
    source:
      "---\nconfig:\n  kanban:\n    ticketBaseUrl: 'https://github.com/mermaid-js/mermaid/issues/#TICKET#'\n---\nkanban\n  todo[Todo]\n    docs[Create documentation]\n    blog[Write blog post about the new diagram]@{ priority: 'Low' }\n  inProgress[In progress]\n    renderer[Improve renderer for edge cases]@{ assigned: 'knsv', priority: 'High' }\n  readyForTest[Ready for test]\n    parserTests[Create parsing tests]@{ ticket: 2038, assigned: 'K.Sveidqvist', priority: 'High' }\n  done[Done]\n    grammar[Design grammar]@{ assigned: 'knsv' }\n    longTitle[Title of diagram is more than 100 chars when user duplicates diagram with 100 char]@{ ticket: 2036, priority: 'Very High' }\n    dbFunction[Update DB function]@{ ticket: 2037, assigned: 'knsv', priority: 'High' }",
  },
  {
    id: 'kanban-2',
    title: '个人任务看板',
    category: '看板',
    diagramType: 'kanban',
    originalTitle: 'Personal Task Board',
    description: 'Visualize work items in a Kanban board',
    source:
      'kanban\n  Todo\n    [Buy groceries]\n    [Book dentist appointment]\n  [In progress]\n    [Plan weekend trip]\n  Done\n    [Pay electricity bill]\n    [Renew gym membership]',
  },
  {
    id: 'classDiagram-1',
    title: '基础类继承',
    category: '类图',
    diagramType: 'classDiagram',
    isDefault: true,
    originalTitle: 'Basic Class Inheritance',
    description: 'Visualize class structures and relationships in object-oriented programming',
    source:
      'classDiagram\n    Animal <|-- Duck\n    Animal <|-- Fish\n    Animal <|-- Zebra\n    Animal : +int age\n    Animal : +String gender\n    Animal: +isMammal()\n    Animal: +mate()\n    class Duck{\n      +String beakColor\n      +swim()\n      +quack()\n    }\n    class Fish{\n      -int sizeInFeet\n      -canEat()\n    }\n    class Zebra{\n      +bool is_wild\n      +run()\n    }',
  },
  {
    id: 'classDiagram-2',
    title: '电商领域模型',
    category: '类图',
    diagramType: 'classDiagram',
    originalTitle: 'E-commerce Domain Model',
    description: 'Visualize class structures and relationships in object-oriented programming',
    source:
      'classDiagram\n    direction LR\n    class Customer {\n        +String name\n        +String email\n        +register()\n        +placeOrder() Order\n    }\n    class Order {\n        +Date createdAt\n        +List~OrderItem~ items\n        +addItem(Product product, int quantity)\n        +total() float\n    }\n    class OrderItem {\n        +int quantity\n        +float unitPrice\n    }\n    class Product {\n        +String name\n        +float price\n    }\n    class PaymentMethod {\n        <<interface>>\n        +authorize(float amount) bool\n    }\n    class CreditCard {\n        +String maskedNumber\n        +authorize(float amount) bool\n    }\n    class GiftCard {\n        +float balance\n        +authorize(float amount) bool\n    }\n\n    Customer "1" --> "0..*" Order : places\n    Order "1" *-- "1..*" OrderItem : contains\n    OrderItem "0..*" --> "1" Product : refers to\n    PaymentMethod <|.. CreditCard\n    PaymentMethod <|.. GiftCard\n    Order --> PaymentMethod : paid via\n\n    note for PaymentMethod "New payment providers only\nneed to implement authorize()"',
  },
  {
    id: 'sequence-1',
    title: '基础时序图',
    category: '时序图',
    diagramType: 'sequence',
    isDefault: true,
    originalTitle: 'Basic Sequence',
    description: 'Visualize interactions between objects over time',
    source:
      'sequenceDiagram\n    Alice->>+John: Hello John, how are you?\n    Alice->>+John: John, can you hear me?\n    John-->>-Alice: Hi Alice, I can hear you!\n    John-->>-Alice: I feel great!',
  },
  {
    id: 'sequence-2',
    title: '在线支付流程',
    category: '时序图',
    diagramType: 'sequence',
    originalTitle: 'Online Payment Flow',
    description: 'Visualize interactions between objects over time',
    source:
      'sequenceDiagram\n    autonumber\n    actor Customer\n    participant Shop as Web Shop\n    participant Pay as Payment Service\n    participant Bank\n\n    Customer->>Shop: Place order\n    activate Shop\n    Shop->>Pay: Create payment request\n    activate Pay\n    Pay->>Bank: Authorize card\n    Bank-->>Pay: Authorization result\n    alt Payment approved\n        Pay-->>Shop: Payment confirmed\n        Shop-->>Customer: Show receipt\n    else Payment declined\n        Pay-->>Shop: Payment failed\n        Shop-->>Customer: Ask for another card\n    end\n    deactivate Pay\n    deactivate Shop',
  },
  {
    id: 'sequence-3',
    title: '包含并行操作的送餐流程',
    category: '时序图',
    diagramType: 'sequence',
    originalTitle: 'Food Delivery with Parallel Actions',
    description: 'Visualize interactions between objects over time',
    source:
      'sequenceDiagram\n    participant App as Mobile App\n    participant API as Order Service\n    participant Kitchen\n    actor Courier\n\n    App->>API: Submit order\n    Note right of API: Validate items,<br/>charge payment\n    par Notify kitchen\n        API->>Kitchen: New order ticket\n    and Confirm to customer\n        API-->>App: Order accepted, ETA 30 min\n    end\n    Kitchen-->>API: Order ready\n    API->>Courier: Request pickup\n    loop Until delivered\n        Courier->>App: Share live location\n    end\n    Courier-->>App: Order delivered',
  },
  {
    id: 'pie-1',
    title: '基础饼图',
    category: '饼图',
    diagramType: 'pie',
    isDefault: true,
    originalTitle: 'Basic Pie Chart',
    description: 'Visualize data as proportional segments of a circle',
    source:
      'pie title Pets adopted by volunteers\n    "Dogs" : 386\n    "Cats" : 85\n    "Rats" : 15',
  },
  {
    id: 'pie-2',
    title: '带数值的工作日分布',
    category: '饼图',
    diagramType: 'pie',
    originalTitle: 'Workday Breakdown with Values',
    description: 'Visualize data as proportional segments of a circle',
    source:
      'pie showData title Where the workday goes (minutes)\n    "Focused work" : 210\n    "Meetings" : 120\n    "Email and chat" : 90\n    "Breaks" : 45\n    "Context switching" : 15',
  },
  {
    id: 'journey-1',
    title: '我的工作日',
    category: '用户旅程',
    diagramType: 'journey',
    isDefault: true,
    originalTitle: 'My Working Day',
    description: 'Visualize user interactions and experiences with a system',
    source:
      'journey\n    title My working day\n    section Go to work\n      Make tea: 5: Me\n      Go upstairs: 3: Me\n      Do work: 1: Me, Cat\n    section Go home\n      Go downstairs: 5: Me\n      Sit down: 5: Me',
  },
  {
    id: 'journey-2',
    title: '在线购买杂货',
    category: '用户旅程',
    diagramType: 'journey',
    originalTitle: 'Online Grocery Shopping',
    description: 'Visualize user interactions and experiences with a system',
    source:
      'journey\n    title Ordering groceries online\n    section Browse and select\n      Search for items: 6: Customer\n      Compare prices: 4: Customer\n      Add to basket: 7: Customer\n    section Checkout\n      Choose delivery slot: 5: Customer\n      Pay for order: 3: Customer\n    section Fulfilment\n      Pick items in store: 4: Store staff\n      Deliver groceries: 5: Driver\n      Unpack at home: 7: Customer',
  },
  {
    id: 'mindmap-1',
    title: '基础思维导图',
    category: '思维导图',
    diagramType: 'mindmap',
    isDefault: true,
    originalTitle: 'Basic Mindmap',
    description: 'Visualize ideas and concepts in a tree-like structure',
    source:
      'mindmap\n  root((mindmap))\n    Origins\n      Long history\n      ::icon(fa fa-book)\n      Popularisation\n        British popular psychology author Tony Buzan\n    Research\n      On effectiveness<br/>and features\n      On Automatic creation\n        Uses\n            Creative techniques\n            Strategic planning\n            Argument mapping\n    Tools\n      Pen and paper\n      Mermaid',
  },
  {
    id: 'mindmap-2',
    title: '带形状和图标的旅行规划',
    category: '思维导图',
    diagramType: 'mindmap',
    originalTitle: 'Trip Planning with Shapes and Icons',
    description: 'Visualize ideas and concepts in a tree-like structure',
    source:
      'mindmap\n  root((Summer Trip))\n    Destination\n      Beach town\n      Mountain village\n    Budget\n      ::icon(fa fa-wallet)\n      Flights\n      Hotel\n      Food and activities\n    Packing\n      Documents\n        Passport\n        Travel insurance\n      reminder{{Sunscreen!}}\n    Activities\n      ::icon(fa fa-person-hiking)\n      Hiking\n      Snorkeling\n      Local food tour',
  },
  {
    id: 'requirement-1',
    title: '电动自行车制动系统',
    category: '需求图',
    diagramType: 'requirement',
    isDefault: true,
    originalTitle: 'E-Bike Braking System',
    description: 'Visualize system requirements and their relationships',
    source:
      'requirementDiagram\n\n    requirement rider_safety {\n        id: 1\n        text: Riders must be able to stop safely in all conditions.\n        risk: high\n        verifymethod: test\n    }\n\n    functionalRequirement brake_response {\n        id: 1.1\n        text: Brakes engage within 100 ms of lever pull.\n        risk: medium\n        verifymethod: test\n    }\n\n    performanceRequirement stopping_distance {\n        id: 1.2\n        text: Stop from 25 km/h within 4 m on dry pavement.\n        risk: medium\n        verifymethod: demonstration\n    }\n\n    designConstraint water_resistance {\n        id: 1.3\n        text: Brake electronics must be IP67 rated.\n        risk: low\n        verifymethod: inspection\n    }\n\n    element brake_controller {\n        type: hardware\n        docRef: "specs/brake-controller"\n    }\n\n    element road_test_suite {\n        type: "test suite"\n        docRef: "qa/road-tests"\n    }\n\n    rider_safety - contains -> brake_response\n    rider_safety - contains -> stopping_distance\n    brake_response - derives -> water_resistance\n    brake_controller - satisfies -> brake_response\n    road_test_suite - verifies -> stopping_distance',
  },
  {
    id: 'radar-1',
    title: '学生成绩',
    category: '雷达图',
    diagramType: 'radar',
    isDefault: true,
    originalTitle: 'Student Grades',
    description: 'Visualize data in a radial format',
    config: { title: 'Grades' },
    configText: '{\n  "title": "Grades"\n}',
    source:
      '---\ntitle: "Grades"\n---\nradar-beta\n  axis m["Math"], s["Science"], e["English"]\n  axis h["History"], g["Geography"], a["Art"]\n  curve a["Alice"]{85, 90, 80, 70, 75, 90}\n  curve b["Bob"]{70, 75, 85, 80, 90, 85}\n\n  max 100\n  min 0\n',
  },
  {
    id: 'radar-2',
    title: '带多边形网格的框架比较',
    category: '雷达图',
    diagramType: 'radar',
    originalTitle: 'Framework Comparison with Polygon Grid',
    description: 'Visualize data in a radial format',
    source:
      'radar-beta\n  title Frontend Framework Comparison\n  axis perf["Performance"], dx["Dev Experience"], eco["Ecosystem"]\n  axis learn["Easy to Learn"], docs["Documentation"]\n\n  curve react["React"]{4, 4, 5, 3, 4}\n  curve vue["Vue"]{4, 5, 4, 4, 5}\n  curve svelte["Svelte"]{5, 5, 3, 4, 4}\n\n  graticule polygon\n  max 5\n  min 0',
  },
  {
    id: 'er-1',
    title: '基础 ER 模型',
    category: '实体关系图',
    diagramType: 'er',
    isDefault: true,
    originalTitle: 'Basic ER Schema',
    description: 'Visualize database schemas and relationships between entities',
    source:
      'erDiagram\n    CUSTOMER ||--o{ ORDER : places\n    ORDER ||--|{ ORDER_ITEM : contains\n    PRODUCT ||--o{ ORDER_ITEM : includes\n    CUSTOMER {\n        string id\n        string name\n        string email\n    }\n    ORDER {\n        string id\n        date orderDate\n        string status\n    }\n    PRODUCT {\n        string id\n        string name\n        float price\n    }\n    ORDER_ITEM {\n        int quantity\n        float price\n    }',
  },
  {
    id: 'er-2',
    title: '包含键和注释的流媒体服务',
    category: '实体关系图',
    diagramType: 'er',
    originalTitle: 'Streaming Service with Keys and Comments',
    description: 'Visualize database schemas and relationships between entities',
    source:
      'erDiagram\n    USER ||--o{ SUBSCRIPTION : has\n    PLAN ||--o{ SUBSCRIPTION : "subscribed via"\n    USER ||--o{ WATCH_HISTORY : logs\n    EPISODE ||--o{ WATCH_HISTORY : "appears in"\n    SHOW ||--|{ EPISODE : contains\n    USER {\n        string id PK\n        string email UK "Used for login"\n        string country\n    }\n    SUBSCRIPTION {\n        string id PK\n        string userId FK\n        string planId FK\n        date startedAt\n        bool autoRenew\n    }\n    PLAN {\n        string id PK\n        string name "Basic, Standard or Premium"\n        float monthlyPrice\n    }\n    SHOW {\n        string id PK\n        string title\n        string genre\n    }\n    EPISODE {\n        string id PK\n        string showId FK\n        int seasonNumber\n        int episodeNumber\n    }\n    WATCH_HISTORY {\n        string userId FK\n        string episodeId FK\n        date watchedAt\n        int secondsWatched\n    }',
  },
  {
    id: 'gitGraph-1',
    title: '基础 Git 流程',
    category: 'Git 图',
    diagramType: 'gitGraph',
    isDefault: true,
    originalTitle: 'Basic Git Flow',
    description: 'Visualize Git repository history and branch relationships',
    source:
      'gitGraph\n    commit id: "a3f82c1"\n    branch develop\n    checkout develop\n    commit id: "b7e41d9"\n    commit id: "c9d52e4"\n    checkout main\n    merge develop id: "d4e8f3a"\n    commit id: "e1b6c90"\n    branch feature\n    checkout feature\n    commit id: "f2a8d17"\n    commit id: "a8c3f54"\n    checkout main\n    merge feature id: "b9d7e21"',
  },
  {
    id: 'gitGraph-2',
    title: '发布与热修复工作流',
    category: 'Git 图',
    diagramType: 'gitGraph',
    originalTitle: 'Release and Hotfix Workflow',
    description: 'Visualize Git repository history and branch relationships',
    source:
      'gitGraph\n    commit id: "initial setup"\n    branch develop\n    commit id: "feat: login page"\n    commit id: "feat: search"\n    checkout main\n    merge develop tag: "v1.0.0"\n    checkout develop\n    commit id: "feat: user profile"\n    checkout main\n    branch hotfix\n    commit id: "fix: crash on load"\n    checkout main\n    merge hotfix tag: "v1.0.1"\n    checkout develop\n    cherry-pick id: "fix: crash on load"\n    commit id: "feat: dark mode"\n    checkout main\n    merge develop tag: "v1.1.0"',
  },
  {
    id: 'gitGraph-3',
    title: '高亮提交',
    category: 'Git 图',
    diagramType: 'gitGraph',
    originalTitle: 'Highlighted Commits',
    description: 'Visualize Git repository history and branch relationships',
    source:
      'gitGraph TB:\n    commit id: "v2 groundwork"\n    commit id: "schema migration" type: HIGHLIGHT\n    commit id: "revert experiment" type: REVERSE\n    commit id: "stabilize" tag: "v2.0.0-rc1"',
  },
  {
    id: 'architecture-1',
    title: '基础系统架构',
    category: '架构图',
    diagramType: 'architecture',
    isDefault: true,
    originalTitle: 'Basic System Architecture',
    description: 'Visualize system architecture and components',
    source:
      'architecture-beta\n    group api(cloud)[API]\n\n    service db(database)[Database] in api\n    service disk1(disk)[Storage] in api\n    service disk2(disk)[Storage] in api\n    service server(server)[Server] in api\n\n    db:L -- R:server\n    disk1:T -- B:server\n    disk2:T -- B:db',
  },
  {
    id: 'architecture-2',
    title: '包含前后端分组的 Web 应用',
    category: '架构图',
    diagramType: 'architecture',
    originalTitle: 'Web App with Frontend and Backend Groups',
    description: 'Visualize system architecture and components',
    source:
      'architecture-beta\n    group frontend(cloud)[Frontend]\n    group backend(cloud)[Backend]\n\n    service web(internet)[Website] in frontend\n    service mobile(internet)[Mobile App] in frontend\n    service api(server)[API Server] in backend\n    service auth(server)[Auth Service] in backend\n    service db(database)[Database] in backend\n    service files(disk)[File Storage] in backend\n\n    web:R --> L:api\n    mobile:R --> L:api\n    api:R --> L:auth\n    api:B --> T:db\n    db:R -- L:files',
  },
  {
    id: 'architecture-3',
    title: '使用连接点的负载均衡',
    category: '架构图',
    diagramType: 'architecture',
    originalTitle: 'Load Balancing with Junctions',
    description: 'Visualize system architecture and components',
    source:
      'architecture-beta\n    service user(internet)[User]\n    service lb(server)[Load Balancer]\n    service app1(server)[App Server 1]\n    service app2(server)[App Server 2]\n    junction fanout\n\n    user:R -- L:lb\n    lb:R -- L:fanout\n    app1:B -- T:fanout\n    app2:T -- B:fanout',
  },
  {
    id: 'xychart-1',
    title: '销售收入',
    category: 'XY 图',
    diagramType: 'xychart',
    isDefault: true,
    originalTitle: 'Sales Revenue',
    description: 'Create scatter plots and line charts with customizable axes',
    source:
      'xychart-beta\n    title "Sales Revenue"\n    x-axis [jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec]\n    y-axis "Revenue (in $)" 4000 --> 11000\n    bar [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000]\n    line [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000]',
  },
  {
    id: 'xychart-2',
    title: '带数据标签的咖啡销量',
    category: 'XY 图',
    diagramType: 'xychart',
    originalTitle: 'Coffee Sales with Data Labels',
    description: 'Create scatter plots and line charts with customizable axes',
    config: { xyChart: { showDataLabel: true } },
    configText: '{\n  "xyChart": {\n    "showDataLabel": true\n  }\n}',
    source:
      '---\nconfig:\n  xyChart:\n    showDataLabel: true\n---\nxychart-beta\n    title "Cups sold per day"\n    x-axis [Espresso, Latte, "Cold Brew", Mocha, Tea]\n    y-axis "Cups" 0 --> 120\n    bar [95, 110, 68, 45, 30]',
  },
  {
    id: 'xychart-3',
    title: '注册与流失',
    category: 'XY 图',
    diagramType: 'xychart',
    originalTitle: 'Sign-ups vs Churn',
    description: 'Create scatter plots and line charts with customizable axes',
    config: { themeVariables: { xyChart: { plotColorPalette: '#2563eb, #dc2626' } } },
    configText:
      '{\n  "themeVariables": {\n    "xyChart": {\n      "plotColorPalette": "#2563eb, #dc2626"\n    }\n  }\n}',
    source:
      '---\nconfig:\n  themeVariables:\n    xyChart:\n      plotColorPalette: \'#2563eb, #dc2626\'\n---\nxychart-beta\n    title "Sign-ups vs churned users"\n    x-axis [Q1, Q2, Q3, Q4]\n    y-axis "Users" 0 --> 500\n    line [120, 260, 380, 470]\n    line [40, 60, 90, 110]',
  },
  {
    id: 'sankey-1',
    title: '月度预算流向',
    category: '桑基图',
    diagramType: 'sankey',
    isDefault: true,
    originalTitle: 'Monthly Budget Flow',
    description: 'Visualize flow quantities between different stages or processes',
    source:
      'sankey-beta\n\nSalary,Budget,3000\nFreelance work,Budget,1200\nBudget,Rent,1300\nBudget,Groceries,600\nBudget,Transport,250\nBudget,Fun,350\nBudget,Savings,1700',
  },
  {
    id: 'sankey-2',
    title: '求职申请漏斗',
    category: '桑基图',
    diagramType: 'sankey',
    originalTitle: 'Job Application Funnel',
    description: 'Visualize flow quantities between different stages or processes',
    source:
      'sankey-beta\n\nApplications,Screening,120\nScreening,Rejected early,70\nScreening,Phone interview,50\nPhone interview,Rejected,20\nPhone interview,Technical interview,30\nTechnical interview,Rejected late,12\nTechnical interview,Offer,18\nOffer,Declined,4\nOffer,Hired,14',
  },
  {
    id: 'sankey-3',
    title: '能源流向（英国）',
    category: '桑基图',
    diagramType: 'sankey',
    originalTitle: 'Energy Flow (UK)',
    description: 'Visualize flow quantities between different stages or processes',
    config: { sankey: { showValues: false } },
    configText: '{\n  "sankey": {\n    "showValues": false\n  }\n}',
    source:
      "---\nconfig:\n  sankey:\n    showValues: false\n---\nsankey-beta\n\nAgricultural 'waste',Bio-conversion,124.729\nBio-conversion,Liquid,0.597\nBio-conversion,Losses,26.862\nBio-conversion,Solid,280.322\nBio-conversion,Gas,81.144\nBiofuel imports,Liquid,35\nBiomass imports,Solid,35\nCoal imports,Coal,11.606\nCoal reserves,Coal,63.965\nCoal,Solid,75.571\nDistrict heating,Industry,10.639\nDistrict heating,Heating and cooling - commercial,22.505\nDistrict heating,Heating and cooling - homes,46.184\nElectricity grid,Over generation / exports,104.453\nElectricity grid,Heating and cooling - homes,113.726\nElectricity grid,H2 conversion,27.14\nElectricity grid,Industry,342.165\nElectricity grid,Road transport,37.797\nElectricity grid,Agriculture,4.412\nElectricity grid,Heating and cooling - commercial,40.858\nElectricity grid,Losses,56.691\nElectricity grid,Rail transport,7.863\nElectricity grid,Lighting & appliances - commercial,90.008\nElectricity grid,Lighting & appliances - homes,93.494\nGas imports,NGas,40.719\nGas reserves,NGas,82.233\nGas,Heating and cooling - commercial,0.129\nGas,Losses,1.401\nGas,Thermal generation,151.891\nGas,Agriculture,2.096\nGas,Industry,48.58\nGeothermal,Electricity grid,7.013\nH2 conversion,H2,20.897\nH2 conversion,Losses,6.242\nH2,Road transport,20.897\nHydro,Electricity grid,6.995\nLiquid,Industry,121.066\nLiquid,International shipping,128.69\nLiquid,Road transport,135.835\nLiquid,Domestic aviation,14.458\nLiquid,International aviation,206.267\nLiquid,Agriculture,3.64\nLiquid,National navigation,33.218\nLiquid,Rail transport,4.413\nMarine algae,Bio-conversion,4.375\nNGas,Gas,122.952\nNuclear,Thermal generation,839.978\nOil imports,Oil,504.287\nOil reserves,Oil,107.703\nOil,Liquid,611.99\nOther waste,Solid,56.587\nOther waste,Bio-conversion,77.81\nPumped heat,Heating and cooling - homes,193.026\nPumped heat,Heating and cooling - commercial,70.672\nSolar PV,Electricity grid,59.901\nSolar Thermal,Heating and cooling - homes,19.263\nSolar,Solar Thermal,19.263\nSolar,Solar PV,59.901\nSolid,Agriculture,0.882\nSolid,Thermal generation,400.12\nSolid,Industry,46.477\nThermal generation,Electricity grid,525.531\nThermal generation,Losses,787.129\nThermal generation,District heating,79.329\nTidal,Electricity grid,9.452\nUK land based bioenergy,Bio-conversion,182.01\nWave,Electricity grid,19.013\nWind,Electricity grid,289.366",
  },
  {
    id: 'gantt-1',
    title: '产品发布计划',
    category: '甘特图',
    diagramType: 'gantt',
    isDefault: true,
    originalTitle: 'Product Launch Plan',
    description: 'Visualize project schedules and timelines',
    source:
      'gantt\n    title Product Launch Plan\n    dateFormat YYYY-MM-DD\n    section Planning\n        Market research      :done, research, 2024-03-01, 10d\n        Define requirements  :done, reqs, after research, 7d\n    section Build\n        Design prototype     :active, proto, after reqs, 14d\n        User testing         :testing, after proto, 7d\n    section Launch\n        Marketing campaign   :marketing, after proto, 14d\n        Release day          :milestone, after testing, 0d',
  },
  {
    id: 'gantt-2',
    title: '包含依赖关系的网站改版',
    category: '甘特图',
    diagramType: 'gantt',
    originalTitle: 'Website Redesign with Dependencies',
    description: 'Visualize project schedules and timelines',
    source:
      'gantt\n    title Website Redesign Project\n    dateFormat YYYY-MM-DD\n    excludes weekends\n\n    section Discovery\n        Stakeholder interviews :done, interviews, 2024-01-08, 5d\n        Competitive analysis   :done, analysis, 2024-01-10, 4d\n\n    section Design\n        Wireframes             :active, wireframes, after interviews, 7d\n        Visual design          :design, after wireframes, 10d\n        Design sign-off        :milestone, after design, 0d\n\n    section Development\n        Frontend build         :crit, frontend, after design, 15d\n        CMS integration        :cms, after wireframes, 12d\n        Content migration      :content, after cms, 5d\n\n    section Launch\n        QA testing             :qa, after frontend content, 5d\n        Go live                :milestone, after qa, 0d',
  },
  {
    id: 'timeline-1',
    title: '项目时间线',
    category: '时间线',
    diagramType: 'timeline',
    isDefault: true,
    originalTitle: 'Project Timeline',
    description: 'Visualize events and milestones in chronological order',
    source:
      'timeline\n    title History of Social Media Platform\n    2002 : LinkedIn\n    2004 : Facebook\n         : Google\n    2005 : YouTube\n    2006 : Twitter',
  },
  {
    id: 'timeline-2',
    title: '分区产品路线图',
    category: '时间线',
    diagramType: 'timeline',
    originalTitle: 'Product Roadmap with Sections',
    description: 'Visualize events and milestones in chronological order',
    source:
      'timeline\n    title Product Roadmap 2024\n    section Q1 Foundations\n        January : Team hired : Tech stack chosen\n        February : MVP scoped\n        March : Alpha release\n    section Q2 Growth\n        April : Beta program opens\n        May : Mobile app : Public API\n        June : v1.0 launch',
  },
  {
    id: 'quadrantChart-1',
    title: '产品定位',
    category: '象限图',
    diagramType: 'quadrantChart',
    isDefault: true,
    originalTitle: 'Product Positioning',
    description: 'Visualize items in a 2x2 matrix based on two variables',
    source:
      'quadrantChart\n    title Reach and engagement of campaigns\n    x-axis Low Reach --> High Reach\n    y-axis Low Engagement --> High Engagement\n    quadrant-1 We should expand\n    quadrant-2 Need to promote\n    quadrant-3 Re-evaluate\n    quadrant-4 May be improved\n    Campaign A: [0.3, 0.6]\n    Campaign B: [0.45, 0.23]\n    Campaign C: [0.57, 0.69]\n    Campaign D: [0.78, 0.34]\n    Campaign E: [0.40, 0.34]\n    Campaign F: [0.35, 0.78]',
  },
  {
    id: 'quadrantChart-2',
    title: '带样式点的艾森豪威尔矩阵',
    category: '象限图',
    diagramType: 'quadrantChart',
    originalTitle: 'Eisenhower Matrix with Styled Points',
    description: 'Visualize items in a 2x2 matrix based on two variables',
    source:
      'quadrantChart\n    title Task Prioritization\n    x-axis Not Urgent --> Urgent\n    y-axis Not Important --> Important\n    quadrant-1 Do first\n    quadrant-2 Schedule\n    quadrant-3 Eliminate\n    quadrant-4 Delegate\n    Fix production outage: [0.88, 0.92] radius: 9\n    Plan next quarter: [0.28, 0.85]\n    Renew passport: [0.65, 0.75]\n    Answer routine emails: [0.78, 0.28]\n    Tidy desktop folders: [0.18, 0.12]\n    classDef urgent color: #ff3300\n    Book dentist appointment:::urgent: [0.72, 0.62]',
  },
  {
    id: 'packet-1',
    title: 'TCP 数据包',
    category: '数据包图',
    diagramType: 'packet',
    isDefault: true,
    originalTitle: 'TCP Packet',
    description: 'Visualize packet data and network traffic',
    config: { title: 'TCP Packet' },
    configText: '{\n  "title": "TCP Packet"\n}',
    source:
      '---\ntitle: "TCP Packet"\n---\npacket\n0-15: "Source Port"\n16-31: "Destination Port"\n32-63: "Sequence Number"\n64-95: "Acknowledgment Number"\n96-99: "Data Offset"\n100-105: "Reserved"\n106: "URG"\n107: "ACK"\n108: "PSH"\n109: "RST"\n110: "SYN"\n111: "FIN"\n112-127: "Window"\n128-143: "Checksum"\n144-159: "Urgent Pointer"\n160-191: "(Options and Padding)"\n192-255: "Data (variable length)"',
  },
  {
    id: 'packet-2',
    title: '使用相对位的 UDP 数据包',
    category: '数据包图',
    diagramType: 'packet',
    originalTitle: 'UDP Packet with Relative Bits',
    description: 'Visualize packet data and network traffic',
    source:
      'packet\ntitle UDP Packet\n+16: "Source Port"\n+16: "Destination Port"\n+16: "Length"\n+16: "Checksum"\n64-95: "Data (variable length)"',
  },
  {
    id: 'block-1',
    title: '三层 Web 架构',
    category: '块图',
    diagramType: 'block',
    isDefault: true,
    originalTitle: 'Three-Tier Web Architecture',
    description: 'Create block-based visualizations with beta styling',
    source:
      'block-beta\n  columns 3\n  user(("User")):3\n  space:3\n  ui["Web UI"] api["API Server"] db[("Database")]\n\n  user --> ui\n  ui --> api\n  api --> db\n\n  style user fill:#ffe0b2,stroke:#fb8c00\n  style db fill:#bbdefb,stroke:#1e88e5',
  },
  {
    id: 'block-2',
    title: '块箭头与嵌套块',
    category: '块图',
    diagramType: 'block',
    originalTitle: 'Block Arrows and Nested Blocks',
    description: 'Create block-based visualizations with beta styling',
    source:
      'block-beta\ncolumns 1\n  db(("DB"))\n  blockArrowId6<["&nbsp;&nbsp;&nbsp;"]>(down)\n  block:ID\n    A\n    B["A wide one in the middle"]\n    C\n  end\n  space\n  D\n  ID --> D\n  C --> D\n  style B fill:#969,stroke:#333,stroke-width:4px',
  },
  {
    id: 'treemap-1',
    title: '家庭月度预算',
    category: '树状图',
    diagramType: 'treemap',
    isDefault: true,
    originalTitle: 'Monthly Household Budget',
    description: 'Visualize hierarchical data as nested rectangles',
    config: { treemap: { valueFormat: '$0,0' } },
    configText: '{\n  "treemap": {\n    "valueFormat": "$0,0"\n  }\n}',
    source:
      '---\nconfig:\n  treemap:\n    valueFormat: \'$0,0\'\n---\ntreemap-beta\n"Monthly Budget"\n    "Housing"\n        "Rent": 1400\n        "Utilities": 220\n        "Internet": 60\n    "Food"\n        "Groceries": 480\n        "Dining out": 180\n    "Transport"\n        "Car payment": 320\n        "Fuel": 140\n    "Savings"\n        "Emergency fund": 300\n        "Retirement": 400',
  },
  {
    id: 'treemap-2',
    title: '带样式的磁盘用量',
    category: '树状图',
    diagramType: 'treemap',
    originalTitle: 'Disk Usage with Styling',
    description: 'Visualize hierarchical data as nested rectangles',
    source:
      'treemap-beta\n"Storage Used"\n    "Media":::warning\n        "Videos": 120\n        "Photos": 80\n        "Music": 25\n    "Documents"\n        "Work": 35\n        "Personal": 15\n    "Apps": 60\n    "System": 40\n\nclassDef warning fill:#f96,stroke:#333;',
  },
  {
    id: 'eventmodeling-1',
    title: '购物车故事',
    category: '事件建模',
    diagramType: 'eventmodeling',
    isDefault: true,
    originalTitle: 'Shopping Cart Story',
    description:
      'Describe systems using an example of how information has changed within them over time',
    source:
      'eventmodeling\n\ntf 01 ui ShopUI\ntf 02 cmd AddItemToCart\ntf 03 evt ItemAdded\ntf 04 rmo CartView ->> 03\ntf 05 ui CheckoutUI\ntf 06 cmd PlaceOrder\ntf 07 evt OrderPlaced\ntf 08 rmo OrderStatus ->> 07\n',
  },
  {
    id: 'eventmodeling-2',
    title: '跨系统数据流',
    category: '事件建模',
    diagramType: 'eventmodeling',
    originalTitle: 'Cross-System Flow with Data',
    description:
      'Describe systems using an example of how information has changed within them over time',
    source:
      "eventmodeling\n\ntf 01 ui CartUI\ntf 02 cmd AddItem [[AddItem01]]\ntf 03 evt ItemAdded [[ItemAdded]]\n\nrf 04 evt Warehouse.StockChanged\ntf 05 pcr StockProcessor\ntf 06 cmd UpdateAvailability\ntf 07 evt Shop.AvailabilityUpdated\n\ndata AddItem01 {\n  sku: 'SHIRT-M'\n  quantity: 2\n}\n\ndata ItemAdded {\n  sku: string\n  quantity: number\n}\n",
  },
  {
    id: 'venn-1',
    title: '产品最佳交集',
    category: '维恩图',
    diagramType: 'venn',
    isDefault: true,
    originalTitle: 'Product Sweet Spot',
    description: 'Represent relationships in overlapping circles',
    source:
      'venn-beta\n    title "Finding the Product Sweet Spot"\n    set Desirable\n    set Feasible\n    set Viable\n    union Desirable,Feasible["Worth prototyping"]\n    union Feasible,Viable["Cheap to run"]\n    union Desirable,Viable["Hard to build"]\n    union Desirable,Feasible,Viable["Sweet spot"]',
  },
  {
    id: 'venn-2',
    title: '带大小和样式的团队技能重叠',
    category: '维恩图',
    diagramType: 'venn',
    originalTitle: 'Team Skill Overlap with Sizes and Styles',
    description: 'Represent relationships in overlapping circles',
    source:
      'venn-beta\n    title "Where our teams overlap"\n    set FE["Frontend"]:18\n        text fe1["React"]\n        text fe2["CSS"]\n    set BE["Backend"]:22\n        text be1["Databases"]\n        text be2["APIs"]\n    union FE,BE["Full-stack"]:8\n        text fs1["TypeScript"]\n    style FE fill:skyblue\n    style BE fill:lightgreen',
  },
  {
    id: 'treeView-1',
    title: '项目文件结构',
    category: '树视图',
    diagramType: 'treeView',
    isDefault: true,
    originalTitle: 'Project File Structure',
    description: 'Visualize hierarchical data as a tree structure',
    source:
      'treeView-beta\n            my-project/\n                src/\n                    components/\n                        Button.tsx\n                        Header.tsx\n                    App.tsx\n                    index.js\n                .gitignore\n                package.json\n                README.md',
  },
  {
    id: 'treeView-2',
    title: '包含引号名称的共享盘',
    category: '树视图',
    diagramType: 'treeView',
    originalTitle: 'Shared Drive with Quoted Names',
    description: 'Visualize hierarchical data as a tree structure',
    source:
      'treeView-beta\n            "Team Drive"\n                "Quarterly Reports"\n                    "Q1 Review.pdf"\n                    "Q2 Review.pdf"\n                "Brand Assets"\n                    "logo.svg"\n                    "style guide.md"\n                "Meeting Notes"',
  },
  {
    id: 'treeView-3',
    title: '注释',
    category: '树视图',
    diagramType: 'treeView',
    originalTitle: 'Annotations',
    description: 'Visualize hierarchical data as a tree structure',
    config: { treeView: { showIcons: true } },
    configText: '{\n  "treeView": {\n    "showIcons": true\n  }\n}',
    source:
      '---\nconfig:\n  treeView:\n    showIcons: true\n---\ntreeView-beta\n            src/\n                App.tsx :::highlight icon(logos:react) ## main component\n                index.js ## entry point\n                styles.css icon(none)\n            data/\n                model.bin icon(logos:mysql)\n            .env ## environment variables\n            Dockerfile\n            package.json',
  },
  {
    id: 'treeView-4',
    title: '通过配置映射文件类型图标',
    category: '树视图',
    diagramType: 'treeView',
    originalTitle: 'File-Type Icons via Config Maps',
    description: 'Visualize hierarchical data as a tree structure',
    config: {
      treeView: {
        showIcons: true,
        defaultIconPack: 'material-icon-theme',
        filenameIcons: { Dockerfile: 'docker' },
        extensionIcons: { '.ts': 'typescript', '.tsx': 'react-ts', '.txt': 'none' },
      },
    },
    configText:
      '{\n  "treeView": {\n    "showIcons": true,\n    "defaultIconPack": "material-icon-theme",\n    "filenameIcons": {\n      "Dockerfile": "docker"\n    },\n    "extensionIcons": {\n      ".ts": "typescript",\n      ".tsx": "react-ts",\n      ".txt": "none"\n    }\n  }\n}',
    source:
      '---\nconfig:\n  treeView:\n    showIcons: true\n    defaultIconPack: material-icon-theme\n    filenameIcons:\n      Dockerfile: docker\n    extensionIcons:\n      .ts: typescript\n      .tsx: react-ts\n      .txt: none\n---\ntreeView-beta\n            my-project/\n                src/\n                    App.tsx\n                    utils.ts\n                Dockerfile\n                notes.txt\n                README.md',
  },
  {
    id: 'treeView-5',
    title: '文件名中的 Unicode 图标',
    category: '树视图',
    diagramType: 'treeView',
    originalTitle: 'Unicode Icons in Filenames',
    description: 'Visualize hierarchical data as a tree structure',
    source:
      'treeView-beta\n            🚀 rocket-app/\n                📦 packages/\n                    🎨 ui/\n                    🛠️ utils/\n                🧪 tests/\n                📝 README.md\n                ⚙️ config.yaml',
  },
  {
    id: 'wardley-1',
    title: '茶店价值链',
    category: 'Wardley 地图',
    diagramType: 'wardley',
    isDefault: true,
    originalTitle: 'Tea Shop Value Chain',
    description: 'Visualize business strategy and value chains with component evolution',
    source:
      'wardley-beta\ntitle Tea Shop\nsize [1100, 800]\n\nanchor Business [0.95, 0.63]\nanchor Public [0.95, 0.78]\ncomponent Cup of Tea [0.79, 0.61] label [19, -4]\ncomponent Cup [0.73, 0.78]\ncomponent Tea [0.63, 0.81]\ncomponent Hot Water [0.52, 0.80]\ncomponent Water [0.38, 0.82]\ncomponent Kettle [0.43, 0.35] label [-57, 4]\ncomponent Power [0.1, 0.7] label [-27, 20]\n\nBusiness -> Cup of Tea\nPublic -> Cup of Tea\nCup of Tea -> Cup\nCup of Tea -> Tea\nCup of Tea -> Hot Water\nHot Water -> Water\nHot Water -> Kettle\nKettle -> Power\n\nevolve Kettle 0.62\nevolve Power 0.89\n\nnote "Standardising power allows Kettles to evolve faster" [0.30, 0.49]\nnote "Hot water is obvious and well known" [0.48, 0.80]\nnote "A generic note appeared" [0.23, 0.33]\n',
  },
  {
    id: 'wardley-2',
    title: '自定义演进阶段',
    category: 'Wardley 地图',
    diagramType: 'wardley',
    originalTitle: 'Custom Evolution Stages',
    description: 'Visualize business strategy and value chains with component evolution',
    source:
      'wardley-beta\ntitle Data Evolution Pipeline\nsize [1100, 800]\n\nevolution Unmodelled -> Divergent -> Convergent -> Modelled\n\ncomponent User Needs [0.95, 0.05]\ncomponent Data Collection [0.80, 0.15]\ncomponent Custom Analytics [0.70, 0.35]\ncomponent Standardized Reports [0.65, 0.65]\ncomponent Commodity Storage [0.60, 0.85]\n\nUser Needs -> Data Collection\nData Collection -> Custom Analytics\nCustom Analytics -> Standardized Reports\nStandardized Reports -> Commodity Storage\n\nevolve Custom Analytics 0.60\nevolve Standardized Reports 0.85\n',
  },
  {
    id: 'wardley-3',
    title: '流水线组件',
    category: 'Wardley 地图',
    diagramType: 'wardley',
    originalTitle: 'Pipeline Components',
    description: 'Visualize business strategy and value chains with component evolution',
    source:
      'wardley-beta\ntitle Kettle Evolution Pipeline\nsize [1100, 800]\n\ncomponent Kettle [0.57, 0.45]\ncomponent Power [0.10, 0.70]\n\nKettle -> Power\n\npipeline Kettle {\n  component Campfire Kettle [0.35] label [-60, 35]\n  component Electric Kettle [0.53] label [-60, 35]\n  component Smart Kettle [0.72] label [-30, 35]\n}\n\nCampfire Kettle -> Kettle\nElectric Kettle -> Kettle\nSmart Kettle -> Kettle\n',
  },
  {
    id: 'wardley-4',
    title: 'GPT 分词器架构',
    category: 'Wardley 地图',
    diagramType: 'wardley',
    originalTitle: 'GPT Tokeniser Architecture',
    description: 'Visualize business strategy and value chains with component evolution',
    source:
      'wardley-beta\ntitle GPT Tokeniser\nsize [1100, 800]\n\nanchor GPT Tokeniser [0.90, 0.58]\n\ncomponent tokeniser [0.81, 0.58]\ncomponent encoder [0.60, 0.32] label [1, -9]\ncomponent decoder [0.60, 0.72]\ncomponent methodology [0.72, 0.53]\ncomponent training code [0.68, 0.26] label [-90, 2]\ncomponent inference code [0.65, 0.37] label [-50, -12]\ncomponent algo [0.53, 0.50] label [-15, -17]\ncomponent GPT2 [0.81, 0.65] label [-14, 27]\ncomponent GPT3 [0.81, 0.73] label [-15, 27]\ncomponent GPT4 [0.81, 0.77] label [-14, 28]\ncomponent GPT5 [0.81, 0.37] label [-10, 28]\ncomponent GPT6 [0.81, 0.17] label [-20, 28]\ncomponent GPT7 [0.81, 0.13] label [-13, 27]\ncomponent tokeniser training data [0.29, 0.34] label [-74, -32]\ncomponent special tokens [0.59, 0.26] label [-61, 15]\ncomponent UTF8 [0.17, 0.74]\ncomponent token vocabulary [0.41, 0.56] label [-25, 16]\ncomponent byte pair encoding (BPE) [0.53, 0.76] label [-27, 19]\ncomponent english text data [0.15, 0.37] label [0, 10]\ncomponent code data [0.15, 0.30] label [-31, 23]\ncomponent foreign text data [0.15, 0.23] label [-51, 18]\ncomponent python [0.35, 0.84]\ncomponent sentencepiece [0.25, 0.80] label [-49, 19]\ncomponent IDE [0.27, 0.86]\ncomponent MEGABYTE [0.53, 0.18] label [-28, 28]\ncomponent text merging rules [0.60, 0.21] label [-64, -10]\ncomponent security framework [0.67, 0.58] label [-27, 10]\ncomponent Unicode Consortium [0.06, 0.55]\ncomponent Unicode License v3 [0.13, 0.72] label [-29, 11]\n\nGPT Tokeniser -> tokeniser\n\ntokeniser -> methodology\nmethodology -> training code\nmethodology -> inference code\nmethodology -> security framework\n\ntraining code -> special tokens\ntraining code -> python\n\nalgo -> tokeniser training data\ntraining code -> text merging rules\n\ntraining code -> encoder\ninference code -> decoder\nencoder -> algo\ndecoder -> algo\n\nalgo -> token vocabulary\n\nbyte pair encoding (BPE) -> UTF8\nMEGABYTE -> UTF8\nUTF8 -> Unicode License v3\nUnicode License v3 -> Unicode Consortium\n\ntokeniser training data -> english text data\ntokeniser training data -> code data\ntokeniser training data -> foreign text data\n\npython -> IDE\npython -> sentencepiece\n\npipeline tokeniser {\n  component tokeniser v1 [0.11]\n  component tokeniser v2 [0.80]\n}\n\npipeline methodology {\n  component methodology v1 [0.20]\n  component methodology v2 [0.80]\n}\n\npipeline algo {\n  component algo v1 [0.14]\n  component algo v2 [0.80]\n}\n\ndeaccelerator License Play [0.13, 0.78]\n\nannotations [1, 0]\nannotation 1,[0.57, 0.16] "Alternative algos in research"\nannotation 2,[0.57, 0.76] "Most popular, but not the most efficient"\nannotation 3,[0.20, 0.3] "Ensure balanced token vocabulary"\nannotation 4,[0.60, 0.28] "Required for delimiters"\nannotation 5,[0.70, 0.50] "A structured approach for achieving a goal"\n\nnote "Voting members: Adobe, Amazon, Apple, Google, Meta, Microsoft, Netflix, Salesforce" [0.04, 0.35]\n',
  },
  {
    id: 'cynefin-1',
    title: '事件响应',
    category: 'Cynefin 框架',
    diagramType: 'cynefin',
    isDefault: true,
    originalTitle: 'Incident Response',
    description: 'Decision-making framework for categorizing problems by complexity',
    source:
      'cynefin-beta\n  title Incident Response\n\n  complex\n    "Investigate root cause"\n    "Run chaos experiment"\n\n  complicated\n    "Analyze performance data"\n    "Expert review needed"\n\n  clear\n    "Restart service"\n    "Apply known fix"\n\n  chaotic\n    "Page on-call immediately"\n\n  confusion\n    "Unknown failure mode"\n\n  complex --> complicated : "Pattern identified"\n  clear --> chaotic : "Complacency"\n',
  },
  {
    id: 'cynefin-2',
    title: '包含领域转换的产品策略',
    category: 'Cynefin 框架',
    diagramType: 'cynefin',
    originalTitle: 'Product Strategy with Domain Transitions',
    description: 'Decision-making framework for categorizing problems by complexity',
    source:
      'cynefin-beta\n  title Product Strategy\n\n  complex\n    "New market entry"\n    "Pricing experiments"\n\n  complicated\n    "Competitive analysis"\n    "Capacity planning"\n\n  clear\n    "Standard onboarding"\n    "Invoice processing"\n\n  chaotic\n    "PR crisis response"\n\n  complex --> complicated : "Patterns emerge"\n  complicated --> clear : "Playbook written"\n  clear --> chaotic : "Complacency"\n  chaotic --> complex : "Stabilized"\n',
  },
  {
    id: 'railroad-1',
    title: '表达式语法',
    category: '铁路图 (IR)',
    diagramType: 'railroad',
    isDefault: true,
    originalTitle: 'Expression Grammar',
    description:
      'Visualize grammar rules using railroad diagram IR primitives for direct layout control',
    source:
      'railroad-beta\n    title Expression Grammar\n\n    expression = sequence(\n        nonterminal("term"),\n        zeroOrMore(sequence(\n            choice(terminal("+"), terminal("-")),\n            nonterminal("term")\n        ))\n    ) ;\n    term = sequence(\n        nonterminal("factor"),\n        zeroOrMore(sequence(\n            choice(terminal("*"), terminal("/")),\n            nonterminal("factor")\n        ))\n    ) ;\n    factor = choice(\n        nonterminal("number"),\n        sequence(terminal("("), nonterminal("expression"), terminal(")"))\n    ) ;\n    number = oneOrMore(nonterminal("digit")) ;\n    digit = choice(terminal("0"), terminal("1"), terminal("2"), terminal("3"), terminal("4"), terminal("5"), terminal("6"), terminal("7"), terminal("8"), terminal("9")) ;',
  },
  {
    id: 'railroad-2',
    title: 'JSON 语法',
    category: '铁路图 (IR)',
    diagramType: 'railroad',
    originalTitle: 'JSON Grammar',
    description:
      'Visualize grammar rules using railroad diagram IR primitives for direct layout control',
    source:
      'railroad-beta\n    title JSON Grammar\n\n    json = nonterminal("element") ;\n    element = choice(nonterminal("object"), nonterminal("array"), nonterminal("string"), nonterminal("number"), terminal("true"), terminal("false"), terminal("null")) ;\n    object = sequence(terminal("{"), optional(sequence(nonterminal("member"), zeroOrMore(sequence(terminal(","), nonterminal("member"))))), terminal("}")) ;\n    array = sequence(terminal("["), optional(sequence(nonterminal("element"), zeroOrMore(sequence(terminal(","), nonterminal("element"))))), terminal("]")) ;\n    member = sequence(nonterminal("string"), terminal(":"), nonterminal("element")) ;',
  },
  {
    id: 'railroadEbnf-1',
    title: '表达式语法',
    category: '铁路图 (EBNF)',
    diagramType: 'railroadEbnf',
    isDefault: true,
    originalTitle: 'Expression Grammar',
    description: 'Visualize grammar rules using EBNF notation with W3C and ISO 14977 support',
    source:
      'railroad-ebnf-beta\n    title Expression Grammar\n\n    expression = term ( "+" term | "-" term )* ;\n    term = factor ( "*" factor | "/" factor )* ;\n    factor = number | "(" expression ")" ;\n    number = digit+ ;\n    digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;',
  },
  {
    id: 'railroadEbnf-2',
    title: '语义化版本',
    category: '铁路图 (EBNF)',
    diagramType: 'railroadEbnf',
    originalTitle: 'Semantic Version',
    description: 'Visualize grammar rules using EBNF notation with W3C and ISO 14977 support',
    source:
      'railroad-ebnf-beta\n    title Semantic Version\n\n    version = core ( "-" prerelease )? ( "+" build )? ;\n    core = number "." number "." number ;\n    prerelease = identifier ( "." identifier )* ;\n    build = identifier ( "." identifier )* ;\n    number = digit+ ;\n    identifier = ( letter | digit )+ ;\n    letter = "a" | "b" | "c" ;\n    digit = "0" | "1" | "2" ;',
  },
  {
    id: 'railroadAbnf-1',
    title: '电子邮件地址',
    category: '铁路图 (ABNF)',
    diagramType: 'railroadAbnf',
    isDefault: true,
    originalTitle: 'Email Address',
    description: 'Visualize grammar rules using RFC 5234 ABNF notation',
    source:
      'railroad-abnf-beta\n    title Email Address\n\n    address = local-part "@" domain ;\n    local-part = 1*( ALPHA / DIGIT / "." / "-" ) ;\n    domain = label *( "." label ) ;\n    label = 1*( ALPHA / DIGIT / "-" ) ;',
  },
  {
    id: 'railroadAbnf-2',
    title: '电话号码',
    category: '铁路图 (ABNF)',
    diagramType: 'railroadAbnf',
    originalTitle: 'Phone Number',
    description: 'Visualize grammar rules using RFC 5234 ABNF notation',
    source:
      'railroad-abnf-beta\n    title Phone Number\n\n    phone = [ "+" country-code ] subscriber ;\n    country-code = 1*DIGIT ;\n    subscriber = 1*( DIGIT / "-" / " " ) ;',
  },
  {
    id: 'railroadPeg-1',
    title: '计算器语法',
    category: '铁路图 (PEG)',
    diagramType: 'railroadPeg',
    isDefault: true,
    originalTitle: 'Calculator Grammar',
    description: 'Visualize grammar rules using Parsing Expression Grammar notation',
    source:
      'railroad-peg-beta\n    title Calculator Grammar\n\n    Expression <- Term (("+" / "-") Term)* ;\n    Term <- Factor (("*" / "/") Factor)* ;\n    Factor <- Number / "(" Expression ")" ;\n    Number <- Digit+ ;\n    Digit <- "0" / "1" / "2" / "3" / "4" / "5" / "6" / "7" / "8" / "9" ;',
  },
  {
    id: 'railroadPeg-2',
    title: '带谓词的标识符',
    category: '铁路图 (PEG)',
    diagramType: 'railroadPeg',
    originalTitle: 'Identifiers with Predicates',
    description: 'Visualize grammar rules using Parsing Expression Grammar notation',
    source:
      'railroad-peg-beta\n    title Identifiers (keywords excluded)\n\n    Identifier <- !Keyword Letter Letter* ;\n    Keyword <- "if" / "else" / "while" ;\n    Letter <- "a" / "b" / "c" / "_" ;',
  },
];

export const DEFAULT_MERMAID_SOURCE = MERMAID_EXAMPLES[0].source;
export const DEFAULT_MERMAID_CONFIG =
  '{\n  "theme": "default",\n  "look": "classic",\n  "fontFamily": "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",\n  "fontSize": 16,\n  "htmlLabels": true,\n  "useMaxWidth": true,\n  "flowchart": {\n    "curve": "basis",\n    "nodeSpacing": 50,\n    "rankSpacing": 50\n  }\n}';
