---
title: ERP开发规范学习笔记
author: 阿星𝑷𝒍𝒖𝒔
date: 2021-04-09 17:39:33
categories: Other
tags:
  - 开发规范
---

## 前端规范

### 命名规范

- 命名风格

  | 类型                                                                                | 规范                           | 示例                                                                 |
  | ----------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------- |
  | 变量                                                                                | Camel 命名法                   | `var loadingModules = {};`                                           |
  | 常量                                                                                | 全部字母大写，单词间下划线分割 | `var HTML_ENTITY = {};`                                              |
  | 函数                                                                                | Camel 命名法                   | `function stringFormat(source) {}`                                   |
  | 参数                                                                                | Camel 命名法                   | `function hear(theBells) {}`                                         |
  | 枚举变量使用 Pascal 命名法，枚举的属性使用全部字母大写，单词间下划线分隔 的命名方式 | Pascal 命名法                  | `var TargetState = { READING: 1, READED: 2, APPLIED: 3, READY: 4 };` |

- 命名惯例

  | 类型             | 命名            |
  | ---------------- | --------------- |
  | 查询             | `get*`          |
  | 根据主键单例查询 | `get*ById`      |
  | 根据主键批量查询 | `get*ByIds`     |
  | 校验             | `check*`        |
  | 新增             | `add*`          |
  | 修改             | `edit*`         |
  | 删除             | `delete*`       |
  | 保存             | `save*`         |
  | 取消             | `cancel*`       |
  | 导入             | `import*`       |
  | 导出             | `export*`       |
  | 发起审批         | `launchApprove` |
  | 审批             | `approvePass`   |
  | 审批驳回         | `approveReject` |
  | 是否存在         | `isExists*`     |
  | 是否被使用       | `isUsed*`       |
  | 是否唯一         | `isUnique*`     |

### 代码规范

- 不得省略语句结束的分号
- 在 `if / else / for / do / while` 语句中，即使只有一行，也不得省略块 `{...}`
- 变量、函数在使用前必须先定义(不通过 `var` 定义变量将导致变量污染全局环境)
- 每个 `var` 只能声明一个变量(一个 `var` 声明多个变量，容易导致较长的行长度，并且在修改时容易造成逗号和分号的混淆)
- 变量必须 `即用即声明`，不得在函数或其它形式的代码块起始位置统一声明所有变量，但是根据业务逻辑选择变量声明位置(变量声明与使用的距离越远，出现的跨度越大，代码的阅读与维护成本越高，虽然 JavaScript 的变量是函数作用域，还是应该根据编程中的意图，缩小变量出现的距离空间)
- 不要在循环体中包含函数表达式，事先将函数提取到循环体外(循环体中的函数表达式，运行过程中会生成循环次数个函数对象)
- 使用对象字面量 `{}` 创建新 `Object`
- 变量必须在定义时用注释说明其用途，除非是简单的计数器变量（i , j 之类）
- 禁止使用中文或其他多字节文本字符串作为`JSON`对象 key
- 禁止在前端使用`XML`对象，建议使用`JSON`
- 禁止通过`String.prototype`方式修改或者扩展浏览器自带对象原型方法
- 禁止在`window`对象上增加变量或者给未定义变量赋值
- 禁止在`DOM`中使用内联的 `onclick=”.....”` 事件绑定方式，请使用晚期事件绑定
- 前端标识符命名禁止包含 `password, pwd, username, usercode, admin, session` 这些敏感名称
- 变量命名禁止使用 js 以及 sql 保留关键字

### 注释规范

- 单行注释，必须独占一行，`//` 后跟一个空格，缩进与下一行被注释说明的代码一致
- 文档化注释，为了便于代码阅读和自文档化，以下内容必须包含以 `/**...*/` 形式的块注释中

## 后端规范

### 命名规范

- 基本命名规范

  | 类型           | 规范    | 示例                                       | 是否强制 |
  | -------------- | ------- | ------------------------------------------ | -------- |
  | 命名空间       | Pascal  | `namespace Mysoft.Cbxt.CostMng`            | 强制     |
  | 类型           | Pascal  | `public class DocumentDomainService`       | 强制     |
  | 接口           | Pascal  | `	public interface ITableModel`             | 强制     |
  | 方法           | Pascal  | `public void UpdateData()`                 | 强制     |
  | 属性           | Pascal  | `public int Length{…}`                     | 强制     |
  | 事件           | Pascal  | `public event EventHandler Changed;`       | 强制     |
  | 私有字段       | Camel   | `private string _fieldName;`               | 推荐     |
  | 非私有字段     | Pascal  | `public string FieldName；`                | 强制     |
  | 枚举值         | Pascal  | `FileMode{Append}`                         | 强制     |
  | 参数           | Camel   | `public void UpdateData(string fieldName)` | 强制     |
  | 局部变量       | Camel   | `	string fieldName`                         | 强制     |
  | 私有静态变量   | Pascal  | `private static string _fieldName`         | 推荐     |
  | 非私有静态变量 | Pascal  | `public static string FieldName`           | 推荐     |
  | 常量           | Capital | `const double MYSELF_PI = 3.1415926;`      | 强制     |

- 委托和事件的命名， 委托以`EventHandler`作为后缀命名，事件以其对应的委托类型，去掉`EventHandler`后缀，并加上`On`前缀构成
- 返回`bool`类型的方法、属性的命名，如果方法返回的类型是`bool`类型，则其前缀为`Is`，如果某个属性的类型为`bool`类型，则其前缀为`Can`
- 不使用单个字母的变量，像 i、m、n，使用 index 等来替换，用于循环迭代的变量除外
- 常见集合命名，凡符合下表所列的集合类型，应添加相应的后缀

  | 类型                | 后缀       | 示例                                          |
  | ------------------- | ---------- | --------------------------------------------- |
  | 数组                | Array      | `int[] productArray`                          |
  | 列表                | List       | `List<Product>roductList`                     |
  | DataTable/HashTable | Table      | `HashTable productTable`                      |
  | 字典                | Dictionary | `Dictionary<string,string> productDictionary` |

- 文件名要和文件中的第一个类名同名
- 方法/函数命名规范

  | 方法             | 命名                   |
  | ---------------- | ---------------------- |
  | 查询             | `Get*`                 |
  | 根据主键单例查询 | `Get*ById`             |
  | 根据主键批量查询 | `Get*ByIds`            |
  | 校验             | `Check*`               |
  | 新增             | `Add*`                 |
  | 修改             | `Edit*`                |
  | 删除             | `Delete*`              |
  | 保存             | `Save*`                |
  | 取消             | `Cancel*`              |
  | 导入             | `Import*`              |
  | 导出             | `Export*`              |
  | 发起审批         | `LaunchApprove`        |
  | 审批             | `ApprovePass`          |
  | 审批驳回         | `ApproveReject`        |
  | 是否存在         | `IsExists*`            |
  | 是否被使用       | `IsUsed*`              |
  | 异步方法         | `*Async`               |
  | 实体转换         | `Convert***By***`      |
  | 复数方法         | `Get*ByIds`            |
  | 事务             | `*Trans`               |
  | 导入成功处理     | `*ImportSuccessHandle` |
  | 导入失败处理     | `*ImportErrorHandle`   |

- 常见操作动作名称规范

  | 动作     | 命名        |
  | -------- | ----------- |
  | 发起审批 | `Approving` |
  | 审批通过 | `Approved`  |
  | 审批驳回 | `UnApprove` |

### 代码规范

- 使用静态类模拟`Enum`以便二开扩展，`Enum`的定义很固定，无法动态增加新成员，因此不利于二开扩展
- 使用参数默认值代替重载，并且需要进行代码编译
- DTO、数据表实体、DomainService、AppService、DataApiBaseHandler、EventSubscriberBase 类必须使用`Public`进行修饰；使用`internal`等修饰符会导致该对象无法进行二开扩展
- 调用类型成员内部其他成员需加`this`，调用父类成员需加`base`，可以提高程序可读性
- 类型成员的排列顺序 类型成员的排列顺序自上而下依次为：
  - 字段：私有字段、受保护字段
  - 属性：私有属性、受保护属性、公有属性
  - 事件：私有事件、受保护事件、公有事件
  - 构造函数：参数数量最多的构造函数，参数数量中等的构造函数，参数数量最少的构造函数
  - 方法：重载方法的排列顺序与构造函数相同，从参数数量最多往下至参数最少
- 访问引用类型的变量前，建议先判断变量是否为`null`，防止不必要的空引用异常
- 不要使用一个常量类维护所有常量，要按常量功能进行归类分开维护，常量类杂乱无章，使用查找功能才能定位到修改的常量，不利于理解和维护
- 方法参数不允许超过 5 个(方法参数过多，影响代码可读性)
- 方法体中代码行数不允许超过 50 行,原则是能够一屏内展示完整(单方法代码行数过多，影响代码可读性，同时不便于维护)

### 注释规范

- 类型、属性、事件、方法、方法参数，必须添加注释，注释内容必须清晰说明该函数的业务目的、校验逻辑、内部实现逻辑以及核心注意要点，如果该方法可扩展，则需要添加扩展指引
- 对方法和类使用`“///”`三斜线注释
- 代码行文注释采用`“//”`和`“/**/”`进行，应该尽量说明问题
- 对`public`方法使用`“///”`三斜线注释外还需要附加以下内容

  - `<example>、<code>`提供调用示例、Before 扩展及 After 扩展的建议

    ```csharp
    /// <example>
    /// <para>演示示例：</para>
    /// <code>
    /// Class2 data = new Class2() {
    ///     data.Id = Guid.New(),
    ///     data.Name = "输入名称"
    /// };
    /// Class1 op = new Class1();
    /// op.Save(data);
    /// </code>
    /// <para>输出结果</para>
    /// <code>
    /// --"Class2":{"Id":"000000-000000-00000000-00000","Name":"输入名称"}
    /// </code>
    /// <para>before 扩展建议：我们应该这样那样在那样那样，懂了吗？</para>
    /// <code>
    /// [PluginMethod(nameof(Class1.Save), PluginMode.Before)]
    /// public virtual void SaveBefore(Class2 data)
    /// {
    ///     //TODO:
    /// }
    /// </code>
    /// <para> after扩展建议：我们应该这样那样在那样那样在····编不下去了，懂了吗？</para>
    /// <code>
    /// [PluginMethod(nameof(Class1.Save), PluginMode.After)]
    /// public virtual void SaveAfter(Class2 data)
    /// {
    ///     //TODO:
    /// }
    /// </code>
    /// </example>
    ```

  - `<remarks>`，提供产品代码内部逻辑说明

    ```csharp
    /// <remarks>
    /// 函数内部逻辑:
    /// <list type="number">
    /// <item>
    /// <description>验证参数准确性</description>
    /// </item>
    /// <item>
    /// <description>保存前校验<see cref="Check(Class2)" /></description>
    /// </item>
    /// <item>
    /// <description>如果名称为空，生成默认值</description>
    /// </item>
    /// <item>
    /// <description>保存数据<see cref="Class3.SaveData(Class2)" /></description>
    /// </item>
    /// <item>
    /// <description>保存后需要执行统计信息更新</description>
    /// </item>
    /// </list>
    /// </remarks>
    ```

  - `<exception>`提供函数可能返回的异常

    ```csharp
    /// <exception cref="ArgumentNullException">输入参数不允许为Null</exception>
    ```

  - 完整注释规范

    ```csharp
    /// <summary>
    /// 保存方法
    /// </summary>
    /// <param name="data">数据实体</param>
    /// <example>
    /// <para>代码示例：</para>
    /// <code>
    /// Class2 data = new Class2() {
    ///     data.Id = Guid.New(),
    ///     data.Name = "输入名称"
    /// };
    /// Class1 op = new Class1();
    /// op.Save(data);
    /// </code>
    /// <para>before 扩展建议：我们应该这样那样在那样那样，懂了吗？</para>
    /// <code>
    /// [PluginMethod(nameof(Class1.Save), PluginMode.Before)]
    /// public virtual void SaveBefore(Class2 data)
    /// {
    ///     //TODO:
    /// }
    /// </code>
    /// <para>after 扩展建议：我们应该这样那样在那样那样在</para>
    /// <code>
    /// [PluginMethod(nameof(Class1.Save), PluginMode.After)]
    /// public virtual void SaveAfter(Class2 data)
    /// {
    ///     //TODO:
    /// }
    /// </code>
    /// </example>
    /// <remarks>
    /// 函数内部逻辑:
    /// <list type="number">
    /// <item>
    /// <description>验证参数准确性</description>
    /// </item>
    /// <item>
    /// <description>保存前校验<see cref="Check(Class2)" /></description>
    /// </item>
    /// <item>
    /// <description>如果名称为空，生成默认值</description>
    /// </item>
    /// <item>
    /// <description>保存数据<see cref="Class3.SaveData(Class2)" /></description>
    /// </item>
    /// <item>
    /// <description>保存后需要执行统计信息更新</description>
    /// </item>
    /// </list>
    /// </remarks>
    /// <exception cref="ArgumentNullException">输入参数不允许为Null</exception>
    /// <seealso cref="Class3"/>
    public virtual void Save(Class2 data)
    {
        //1. 验证参数准确性
        if (data == null) throw new ArgumentNullException("data");
            Check(data);
        //2. 如果名称为空，生成默认值
        if (string.IsNullOrEmpty(data.Name))
        {
            data.Name = "未命名";
        }
        //3. 保存数据
        Class3 c3 = new Class3();
        c3.SaveData(data);
        //4. 保存后需要执行统计信息更新
        //TODO:
    }
    ```

### 其他

- 禁止直接吃掉异常，除非特殊原因，且必须以注释形式给出理由(直接吃掉异常后，大多数情况下返回的结果虽然可以让程序运行下去，但是最终程序的表现行为可能不是预期，不容易排查问题，因此这是一条禁止规则，例外场景：某些尝试性的操作返回 BOOL 结果)
- 禁止直接抛出`Exception，System.Exception`类型的异常(这二个都是比较低级别的异常基类，直接使用它们会导致没法按异常类型捕获，以及在记录与分析异常时，没法做过滤分析。建议选择一个合适的、有恰当意义的异常类型，例如：`ArgumentNullException, InvalidOperationException, ConfigurationErrorsException`)
- 自定义的异常类型必须以 Exception 结尾，且标记为`[Serializable]`
- 不要写 `catch { throw; }` 这样的代码，因为没有任何意义
- 字典取值，必须使用 `TryGetValue` 方法
- 字符串转数字，必须使用 `TryParse` 方法
- 禁止使用 `ViewState`，`Session`
- 公开方法必须首先检查参数，如果参数值非预期，直接抛出 `ArgumentException` 派生类型的异常
- 字符串内插(string interpolation)，字符串内插是 C#6.0 的特性，使用字符串内插可以提高程序可读性
- 实体拷贝使用平台`AutoMapper`方式进行拷贝，而不要直接创建对象赋值的方式

## 数据库规范

### 命名规范

- 命名采用`Pascal`规范，标识符最多 128 个字符，临时表名称不超过 116 字符，可采用拼音首字母联合英文单词混合方式.命名与业务意义匹配

### 表规范

- 表名命名规则参照前面基本规则, 尽量用英文命名,中间可以增加部分拼音首字母缩写, 且子系统标识小写, 对象描述中间无需多余分隔符
- 表名不使用复数(表名应该仅仅表里面的实体内容, 不应该表示实体数量)
- 每个表必须定义主键约束, 主键约束命名为`PK+表名`, PK 和表名之间不需要额外的其它字符
- 所有标识列类型用`uniqueidentifier`类型, 非空, 命名以`GUID`结尾(GUID 类型全局唯一，不同于自增长整型为表级唯一)
- 表达是与否概念的字段， 必须用`isXXX`的方式命名，数据类型是`tinyint`(由产品平台的原因要求使用 tinyint 类型而不是 bit 类型)
- 禁用保留字， 如`desc`、 `key`、`select`等，请参考 SQL Server 官方保留自
- 小数类型为`decimal`， 金额为`money`， 禁用浮点数类型`float`和`real`(在存储的时候，`float` 和 `double` 都存在精度损失的问题，很可能在比较值的时候，得到不正确的结果)
- 合适的字符存储长度，不但节约数据库表空间、节约索引存储，更重要的是提升检索速度(存储空间越少， 数据页能存储的行数越多，占用的内存越小， 进而可以缓存更多的数据)
- 一级主页面搜索的字段，推荐设计冗余字段
- 表之间应该是唯一主键关系（如果出现联合主/外键关系，应检查设计合理性）
- 代表同一个意思的字段，在各个表中应都用相同单词表示

  | 字段             | 字段名称           |
  | ---------------- | ------------------ |
  | Name             | 名称               |
  | Code             | 编码               |
  | ParentGUID       | 父级 GUID          |
  | ParentCode       | 父级编码           |
  | StartDate        | 开始日期           |
  | EndDate          | 结束日期           |
  | Remark           | 说明/备注          |
  | EffectDate       | 生效日期           |
  | ExpiryDate       | 失效日期           |
  | IsEnabled        | 是否启用           |
  | Count            | 数量               |
  | Price            | 单价               |
  | Amount           | 金额               |
  | TaxRate          | 税率               |
  | TaxPrice         | 含税单价           |
  | TaxAmount        | 税额               |
  | TotalAmount      | 合计金额           |
  | Source           | 来源               |
  | Documents        | 文档               |
  | Order            | 排序               |
  | Total\*          | 合计字段           |
  | Avg\*            | 平均字段           |
  | SignDate         | 签约日期           |
  | SignTime         | 签约时间           |
  | HtAmount         | 合同金额（含税）   |
  | HtInputTaxAmount | 合同进项税额       |
  | HtNoTaxAmount    | 合同金额（不含税） |
  | Price            | 单价（含税）       |
  | NoTaxPrice       | 单价（不含税）     |
  | TaxRate          | 税率               |
  | TaxAmount        | 税额               |
  | Amount           | 金额（含税）       |
  | NoTaxAmount      | 金额（不含税）     |

### 索引规范

- 索引的命名分聚集索引和非聚集索引，聚集索引（和主键相同时）：`PK+表名`，聚集索引（和主键不同时）：`CX+表名`，非聚集索引：`IX_索引键1_索引键2_...`,（中间以下划线分割每个列）
- 业务上具有唯一特性的字段，即使是多个字段的组合，也必须建成唯一索引(唯一索引虽然会影响 insert 速度， 但是这个损耗可以忽略不计，却可以显著提高查找的速度，另外即使在应用层做了非常完善的校验机制， 只要没有唯一索引， 时间久了必然有脏数据产生)
- 每个表必须定义聚集索引(聚集索引以聚集索引键的顺序存储数据，加快查询的速度，减少索引的碎片)
- 非聚集索引的包含性列不能包含聚集索引键(主要原因是结构重复，浪费索引空间)
- 禁止定义键重复的索引
- 为外键定义索引，但是防止定义过多的索引(经常查询用到的外键定义索引，可以加快查询的速度，但是过多的索引却会导致增删改的性能下降)
- 利用包含性索引来进行查询操作，避免回表(`select a from tab where b=? and c=?; --对应的索引(b,c) include(a)`)
- 建组合索引时，区分度最高的在最左边(存在非等号和等号混合时， 在建立索引时， 需要把等号条件的列前置)

  ```sql
  where c>? and d=?, --那么即使c的区分度更好, 也必须把d放在索引的最前列, 即IX_d_c
  where a=? and b=?, --如果a列的选择率高于b列, 那么建立组合索引时a在前面
  ```

- 防止因字段类型不同造成的隐式转换，导致索引失效
- 创建索引时避免有如下极端误解
  - 认为一个查询就需要建一个索引对应
  - 认为索引会消耗空间， 严重拖慢记录的更新以及行的新增速度
  - 抵制唯一索引， 认为业务的唯一性一律需要在应用层通过”先查后插”方式解决
- 所有的从表的外键字段必须增加索引，业务开发中经常使用主表主键查询从表数据
- 所有的冗余字段，冗余下游表的字段，下游表必须增加外键索引及包含冗余字段

### 视图规范

- 同表的命名规则相似,视图命名规则参照前面基本规则， 尽量用英文命名，中间可以增加部分拼音首字母缩写，且子系统标识小写， 对象描述中间无需多余分隔符
- 不宜在视图中封装复杂的业务逻辑运算
- 禁止使用视图嵌套(视图嵌套会增加 SQL 优化的复杂度, 非常难以修改)

### SQL 语句规范

- 确保连接列上有索引
- 优先使用集合操作数据，避免使用游标的行操作模式(数据库擅长处理集合操作，使用游标的方式却将数据处理变成了过程化处理，导致性能下降)
- 避免在`SELECT`列表，`ORDER BY` 子句里面包含子查询，使用连接代替
- 按需取数，避免使用`SELECT *`
- 避免使用任何查询提示，除非必须这么做(显式使用查询提示在一定特定条件下会优化查询, 但是这个特定条件可能会随着数据量或者 SQL 语句的条件动态变化而变成影响查询性能的因素)
- 为每一个数据源使用别名(为数据源使用别名增加 SQL 脚本可阅读性)
- `LIKE`子句中只有后置`%`可以使用索引，前置`%`无法使用(双向%无法利用索引，可通过全文索引或者其他 ES 方案实现)
- 在数据合并操作时，使用`Merge`语句替换原来的先`Delete`再`Insert`，同时`Merge`语句支持额外的`Where`子句(相比原来 2 个 SQL 语句的读取两次源数据以及 2 次往返数据库， `Merge`只读取一次源数据， 只需要一次服务器往返时间)

  ```sql
  --正例
  MERGE INTO A
  USING ( SELECT  AGUID ,
                  AName
          FROM    B
      ) B
  ON ( A.GUID = B.AGUID )
  WHEN MATCHED THEN
      UPDATE SET A.Name = B.AName
  WHEN NOT MATCHED THEN
      INSERT ( GUID, Name )
      VALUES ( B.AGUID, B.AName );

  --反例
  DELETE  A
  FROM    A
          INNER JOIN B ON A.GUID = B.AGUID;
  INSERT  INTO A
          SELECT  B.AGUID ,
                  B.AName
          FROM    B
                  INNER JOIN B ON A.GUID = B.AGUID;
  ```

- 判断父表的记录是否存在于子表，先确保子表外键有索引，并使用`exists`而不是`in`子查询(`exists`判断在子表有重复数据时，只需要处理一次，`In`子句先执行数据排序去重操作)
- 不要使用 count(列名)或者 count(常量)来替代`count(*)`，`count(*)`是 SQL92 定义的标准统计行数的语法， 跟数据库无关，跟 NULL 和非 NULL 无关(`count(*)`会统计值为`NULL`的行，而 count(列名)不会统计此列为`NULL`值的行)
- 当某一列的值全部是 NULL 时， count(col)的返回值为 0， 但是 sum(col)的返回结果为 NULL，因此使用`sum()`时请注意 NPE 问题(`select sum(isnull(col,0)) from T.** --使用这种方式来避免sum()的NPE问题`)
- 使用`ISNULL()`来判断是否为 NULL 值(NULL 与任何值的直接比较都为 NULL, _`NULL<>NULL`的返回结果是`NULL`，而不是 `false`，_`NULL=NULL`的返回值是`NULL`， 而不是`true`\*，`NULL<>1`的返回结果是`NULL`， 而不是`true`)
- 代码中写分页查询逻辑时，若 count 为 0 应直接返回，避免执行后面的分页语句
- IN 操作在使用时请注意 IN 后边的集合元素数量, 控制在 1000 个之内(大量的集合可以使用表变量类型替代)
- Truncate Table 比 Delete 速度快， 且使用的系统和事务日志资源少， 但是 Truncate 无事务且不触发 trigger，有可能造成事故，故不建议在开发代码中使用此语句

## 平台规范

### 平台前端规范

- 禁止引入不需要的模块
- 禁止使用路径方式引用模块
- 禁止使用`seajs`异步加载模块，会导致不可预期的脚本加载行为
- 必须在模块顶部引入所有依赖模块，且只能引入一次
- 禁止使用 JavaScript 原生的数值计算，使用平台提供的 `mapnumber` 组件
- 禁止使用原生的 DOM 操作 API，必须使用 jQuery 或者平台组件提供的 API
- 禁止使用 `utility.ajax` 之外的 ajax 实现方式
- 禁止设置 `async:false`,ajax api 必须以异步方式调用
- 禁止拼接 URL，HTML，必须使用平台工具方法 `utility.buildUrl`, `utility.tmpl`
- 只允许 ajax 访问当前业务单元的 AppService 功能，禁止跨业务单元或子系统访问
- 禁止访问、操作平台组件 DOM 元素以及访问全局内部变量
- 禁止使用或重写平台控件内部样式
- 定义私有变量必须使用 `var` 在模块顶部定义，且在 `require()` 后面
- 禁止使用 `iframe`、`setTimeout`、`setInterval`
- 禁止 ajax 嵌套使用，必须使用平台提供的级联方案，前后台异步调用
- 私有方法只允许定义成工具方法，不允许将 ns 做为方法参数，不允许将私有方法添加到 ns 暴露给外部
- 禁止扩展当前模块或其他模块接口，会导致平台扩展机制失效
- 禁止使用 window 对象，刷新、跳转、打开新页面统一使用平台`utility`工具库中的接口
- 禁止在列表 load 事件内遍历数据
- 禁止在前端构造树结构后赋值树列表组件
- 禁止在列表`drawCell`事件中使用`mapnumber`进行数值运算
- 所有存在异步请求的方法，必须返回异步对象
- 业务模块内的前端 ajax 请求，必须使用请求代理服务
- 如果是保存按钮，必须使用平台自带的保存功能配置后端方法，不要自己发送请求（会引起新增刷页面、刷父级页面等常规功能失效）
- 平台自带输出的 JS 文件名太长，可能引起打包失败，因此推荐将页面 JS 去掉命名空间前缀，ajax js 保留命名空间前缀 AppService 这一级
- 禁止使用`window.parent`模式操作页面元素，跨页面之间的交互请使用消息订阅机制
- JS 模块内部不要再次嵌套建立具有函数的对象，应该提取为新的模块

### 平台后端规范

- 后端三层服务架构

  - 应用服务层：用于处理当前子系统的业务逻辑，表现层与应用服务层交互的入口
  - 领域层：包含面向领域实体的核心业务逻辑，供应用服务层调用
  - 数据访问层：实体服务(由平台提供)，封装对单个实体的 CRUD 操作
  - 开发规范：
    - 表现层不允许直接调用领域层的服务 跨业务单元调用必须通过公共服务（PublicService)；
    - 应用服务层不允许包含实体相关的核心业务逻辑，应该封装到领域层服务里；
    - 同一聚合中领域服务之间不允许相互访问，需通过领域根服务调用；
    - 不同聚合不允许相互访问，需通过应用服务调用；
    - 领域服务不允许引用其他领域服务对应的实体服务；
    - 新增、修改、删除的数据操作，必须通过实体服务，不允许使用 SQL 操作；

- `AppService`需要添加标记`AppServiceScope`并且`AppService`中的方法必须加上`ActionDescription`标记，特殊情况根据业务可以不加
- `AppService` / `PubAppService`中禁止前端访问的公开方法需要加上`Forbidden`标记
- 在`DomainService` / `AppService`中公开方法禁止重名或使用重载，且必须使用`virtual`修饰虚方法
- 枚举中`EnumOrder`不要从 1 开始，且两个枚举排序值之间需要预留空间
- 不需要查询所有数据时，建议使用实体服务的`Where`代替`Find`做数据查询(使用 Find 生成的 SQL 是查询所有数据，如果不需要查询所有数据，使用 Where 过滤数据，Select 指定查询列)
- 大于 10 行（有效代码）的方法，有效注释行/代码有效行数之比要大于 1/3
- 禁止使用枚举中对应文本字段做过滤条件(使用文本字段做过滤条件，无法适配多语言，同时如果涉及文本调整，硬编码的影响较大，而且索引一般仅覆盖枚举字段，文本字段需要重新覆盖索引，影响整体性能)
- 在 XmlCommand 中仅允许执行查询操作，禁止执行任何增、删、改操作(XmlCommand 中执行的数据操作无法触发实体变更事件)
- `AppService` / `DomainService`对象的实例化必须使用`LazyService`(可以延迟到使用的时候在实例化，提升性能，同时平台的二开扩展拦截需要使用 LazyService 才能生效)
- ERP 各子系统间的调用，需要使用`RemoteService`(RemoteService 可以根据是集中部署还是分离部署动态调整调用方式)
- 禁止直接访问其他系统的表（包括平台表，平台分发的表除外）(子系统分离部署，数据库也是拆分的，所以无法访问到其他系统的表)
- DTO 必须继承`DtoBase`(继承 DtoBase，前端添加字段后，才能不调整 DTO 来接收前端添加的字段)
- 对于 GUID 形式的变量，前后端、数据库统一使用“GUID”命名
- 产品开发过程中函数推荐使用三段式（保存前，保存，保存后），便于二开
- 禁止引用 Plugin 程序集，并且 Plugin 程序集里面只允许写扩展类方法，其他方法放到二开独立
- 不允许直接在 AppService 写数据库访问操作
- 使用实体时，不要人工处理 Create 和 Modify 的信息，数据尽量不要先删后插，识别清楚再决定是 Insert/Update/Delete（防止审计失效），推荐使用平台自带的建模搜集，无需自己处理
- 产品方法禁止使用泛型(泛型方法二开无法进行 AOP 扩展)
- 实体赋值、事务提交、异步需单独提炼方法
- 对外开放的接口必须继承`IPublicService`，方法上必须打`ExportApi`标记(这里“对外开放”指的是对 ERP 外部系统开放)

  ```csharp
  /// <summary>
  /// 业务参数公共服务
  /// </summary>
  public interface IParamPublicService : IPublicService
  {
      /// <summary>
      /// 获取非禁用的业务参数值
      /// </summary>
      /// <param name="paramCode">业务参数编码</param>
      /// <param name="scopeId">公司或者项目Id</param>
      /// <returns></returns>
      [ExportApi("获取选项类业务参数值", "获取选项类业务参数值", "0000")]
      [ApiReturn(typeof(List<MyParamValue>), "业务参数值列表")]
      [ApiParam("paramCode", typeof(string), "业务参数编码", true)]
      [ApiParam("scopeId", typeof(Guid), "公司或者项目Id", true)]
      List<MyParamValue> GetByScopeIgnoreDisabled(string paramCode, Guid scopeId);
  }
  ```

- 发布的领域事件必须单独新建一个事件发布者类，继承`EventPublisherBase`，并打上`Event`、`EventParam`标记

### 平台建模规范

- 创建模块过程中，模块名称使用中文字符，与模块业务相关，字数控制在 8 个以下
- 创建模块过程中，模块编号使用两位数字，从 1 开始顺序增长，增长单位为 1，单位不足左补 0
- 创建模块过程中，模块编号根据模块业务选择适当的图标
- 创建模块过程中，权限点名称使用中文字符，与权限业务相关，控制在 6 个字符以下
- 创建模块过程中，权限点编号名称使用数字命名，增长单位为 1，两位数字，单位不足左补 0
- 创建页面过程中，页面名称使用中文字符，与页面业务相关，字符控制在 20 以下
- 创建页面过程中，页面 ID 名称使用英文字母和数字，首字符为字母，禁止使用拼音，使用 Pascal 命名，字符控制在 30 以内
- 创建页面过程中，页面开放级别在二开新增页面时选择完全开放
- 配置类业务参数常用于业务判断、逻辑分支控制、属性配置类场景
- 选项类业务参数常用于数据录入的备选项、辅助录入类场景
- 自定义业务参数支持 URL 方式挂接 Aspx 页面，通常可使用建模搭建简单基础页面，复制页面地址作为自定义参数配置地址

## 高性能开发规范

### 前端高性能规范

- 请合并前端请求，减少请求数量（页面请求不超过 20 个）
- Css 引用放在页头，JS 引用放在页尾
- 避免一次加载大量数据，应该采用分页分层方式加载数据（树，网格）
- 对于一屏展示不完的内容，建议使用懒加载方式，提升性能
- 块元素以及图片应该尽量指定高度，减少页面重绘
- 确保引用的资源文件都是存在的，避免产生 404 错误
- 必须使用异步 AJAX 请求后端服务
- 避免使用 CSS 表达式(CSS 表达式会影响页面渲染时间)
- JS，CSS 尽量采用外部文件来保存，便于缓存请求
- 避免反复查找 DOM 元素，或者执行重复计算，应该多用变量保存计算结果（或者 DOM 对象）

### 后端高性能规范

- 禁止循环中操作数据库(循环中操作数据库会频繁开关数据库连接，尤其循环次数多时性能损耗非常严重)
- 使用 StringBuilder 来完成字符串的拼接，禁止直接使用字符串直接相加
- 使用局部变量缓存结果，减少重复计算(对于需要计算的结果，并被多处使用，请先用局部变量缓存计算结果)
- 字符串比较避免不必要的大小写转换逻辑，使用`String.Compare`方法代替(`ToUpper`、`ToLower`转换字符串后进行比较，内部会生成垃圾字符串，增大内存负担，使用`String.Compare`方法代替，可以忽略大小写进行比较)
- 合理使用缓存，对于一些不经常变化的数据可以使用缓存减轻数据库的压力
- 事务尽可能短小，减少事务持有时间（包括将查询操作放在事务外）
- 尽量减小锁的粒度和锁定范围来提升系统吞吐(锁粒度大小会影响系统吞吐，在保证原子性的同时减小锁粒和锁定范围来提升系统并发性能)
- 大量数据遍历推荐使用`Dictionary`代替`List`操作(List 是遍历查找，时间复杂度是 O(n),Dictionary 基于 Hash 查找时间复杂度 O(1) )
- 使用数据库连接池和线程池(对数据库和多线程的操作使用连接池，可以重用连接和线程，避免不断创建关闭带来性能损耗)
- 尽量产生少的对象，如果一个对象可以重用，尽量不要每次都重复创建
- 避免创建不必要的对象
- 使用有序`GuidHelper.NewSeqGuid()`代替`Guid.NewGuid()`(使用非有序主键插入数据，会导致数据页频繁移动而影响性能)
- 超过 30s 的后端服务请使用异步后台任务方案，比如批量操作(批量操作耗时较久，如果同步等待 Http 返回，可能导致 http 超时，应使用异步方案待后台处理完毕后再通知前端完成相应操作)
- 少用弱类型的设计，尽量使用泛型类型避免装箱拆箱
- 批量插入建议使用`SqlBulkInsert`方法

### SQL 高性能规范

- 使用参数化查询，重用执行计划
- 尽量使用`UNION ALL`而不是`UNION`(UNION 会引入去重排序操作, 排序是一个耗时的操作, 而 UNION ALL 没有此操作, 速度更快 正例：)
- 禁止使用触发器，禁止使用存储过程，禁止使用 CLR SP
- 可适当增加冗余字段降低查询的复杂度
- 尽量降低 SQL 语句的复杂性，可适当返回 粗粒度结果让 应用程序代码来处理
- WHERE 过滤条件要符合 SARG 原则
- 为每个数据表创建聚集索引，以及其它必要的索引（根据业务需求识别经常要查询的字段）(经常作为过滤条件的列覆盖必要的索引可以提升查询性能，同时避免表扫描造成的死锁阻塞)
- 索引列不允许超过 3 个字段，索引包含列不允许超过 10 个字段（建议只包含关联表的过滤条件字段、排序字段）(索引字段和包含列越多维护代价越大，影响数据插入和更新的性能)
- 单表索引不允许超过 10 个(索引越多维护代价越大，影响数据插入和更新的性能)
- 非聚集索引中不需要包含聚集索引健(非聚集索引中的叶子节点已经包含了聚集索引健)
- 禁止出现重复索引以及包含索引(重复索引和包含索引只需保留一个即可)
- Guid 的存储不要使用\*CHAR 存储(避免不必要的类型转换造成无法使用索引)
- 视图禁止包含超过 3 个表，禁止超过 3 层子查询(视图包含过多的表以及子查询，会影响使用性能)

#### 缺少索引的危害

- I/O -> 内存 -> CPU ，压力全部变大。
- 由于需要扫描大量记录，导致语句运行很慢。
- 容易产生大量的锁，阻塞其它进程，以及被阻塞。
- 由于持有过多的锁，出现死锁的机率也会变大。

#### SARG 是什么？

- SARG: Searchable Arguments
- 搜索参数 (SARG) 可指定精确匹配、值的范围或由 AND 联接的两项或多项的连接，因此能够限制搜索范围。
- SARG 格式：
  - 列 运算符 <常量或变量>
  - <常量或变量> 运算符 列
- SARG 运算符包括 =、>、<、>=、<=、IN、BETWEEN，有时还包括 LIKE（在进行前缀匹配时，如 LIKE ‘Fish%'）。
- SARG 可以包括由 AND 联接的多个条件。
- 非 SARG 运算符包括：NOT 运算符 、函数调用 和 字段计算表达式。

#### 不符合 SARG 的改进建议

- 有函数调用的：去掉函数掉用，调整语句。
- 字段计算表达式：将字段与常量分离。
- 使用 NOT：调整业务需求，使用一个较小的范围。
- 使用 NOT：根据业务需求，拆分表。
- LIKE‘%XXX%’ ：调整业务需求，改写为 LIKE ‘XXX%’。

### 建模高性能规范

- 数据列表中，计算公式列不允许超过 3 个，因为超过 3 个后公式的计算降低 SQL 的执行效率，最终延长页面的加载时间，建议改成简单公式或者优化需求场景
- 下拉选项控件中，无论是那个选项来源，定义备选项的个数不能超过 50 个
- 下拉选项控件中，如果选项来源是“数据 API”，则在请求过程代码中，不能再通过 http 请求访问第三方数据或业务逻辑
- 分区多、控件多（子控件、相关列表）开启按需加载(表单按需加载是基于表单中的分区进行动态渲染，所以对于没有分区或者只存在一个分区的表单启用按需加载无任何意义)
- 树列表数据 500+时，开启按需加载(浏览器性能存在瓶颈，树列表数据 500+ 在 IE 下就可能存在性能问题,注意：只有自适应模式模式下才支持按需加载)
- 列表列数最好不要超过 9 列，以不出横行滚动条为准(列表字段过多不仅影响用户浏览体验，同时会影响数据获取和界面渲染的整体性能)
- 禁止列表中获取过多隐藏字段作为其他功能的参数(其他功能的参数应该在功能触发时去获取，在列表加载过多隐藏字段影响列表加载性能)
- 建议不要使用全列表编辑(全列表编辑会加大页面渲染压力)
- 禁止在列表 load 事件后遍历数据
- 禁止启用数据自动加载后在\_pageReady 中再次触发 Query 事件(这样会造成二次加载，如果需要在\_pageReady 中指定过滤条件后触发 Query，请关闭数据自动加载)
- 建模数据源不允许关联包含超过 5 张表（包含视图中的表）(关联表过多会影响查询性能，需要业务上进行场景拆分或则使用 API 取数)

## 安全规范

### 安全编码的基本准则

- 不要相信用户的任何输入数据，因为所有数据都是可以伪造的，用户数据包括 HTTP 请求中的一切，例如：QueryString, Form, Header, Cookie, File
- 服务端在处理请求前，必须先验证数据是否合法，以及用户是否具有相关的操作权限，注意：客户端的界面权限控制不能保证系统安全性，那只是为了增强用户体验而已
- 禁止拼接，SQL 注入，XSS 攻击的产生都与拼接有关，它们都是由于缺乏转义处理造成的
- 客户端对任何人都是透明的，因此尽量不要将敏感数据发送到客户端，必要时一定要加密处理
- 敏感数据应该加密（或者 Hash）保存，日志及调试手段中不能出现敏感数据
- 涉及数据修改的操作，必须采用 POST 方式提交，防止利用漏洞进行恶意调用
- 动态的反射调用应该仅针对公开方法或者有确定标记的方法
- 操作文件或者目录，不能直接依据 HTTP 数据来决定路径，应该有明确的目标（范围）或者采用白名单方式

### SQL 注入

原则：不允许拼接【SQL 字符串】，只能使用参数化 SQL 语句 注意：存储过程中也不允许拼接【SQL 字符串】，存储过程中可以拼接参数化 SQL，需要使用 sp_executesql 来执行参数化 SQL

```csharp
//1.使用CPQuery
string parameterizedSQL = "insert table1(f1, f2) values(@f1, @f2)";
var parameter = new {f1 ="aaa", f2 ="cccc"};
CPQuery.From(parameterizedSQL, parameter).ExecuteNonQuery();

//2.使用XmlCommand
var para = new { ItemId = comment.ItemId, count =-1 }; XmlCommand.From("Increase_Item_ReplyCount", para).ExecuteNonQuery();
```

### XSS 攻击

原则：输出到 HTML 中的文本部分，必须做编码处理（HTML, URL, JS），可使用`HttpUtility`的相关方法，如：`HtmlEncode，HtmlAttributeEncode，UrlEncode，JavaScriptStringEncode`

### Cookie 安全

原则：不能将敏感数据【直接】保存到 Cookie 中

### 加密算法

- 密码之类的敏感数据一定不能明文保存，只能保存 Hash 值，并在计算 Hash 时加入 salt 处理
- 不得自己编写加密算法，因为不专业，安全性无法保证，但允许对标准加密算法进行封装
- Hash 算法推荐选择 SHA256
- 对称加密算法推荐选择 AES
- 解密失败时，不得对外抛出异常，否则会被【Padding Oracle Attack】攻击
- 不建议使用非对称加密方法

### HTTP 请求

- 涉及更新业务数据的请求，必须要采用 POST 请求，防止被 XSS 攻击后产生恶意调用
- 如果请求中包含敏感数据，必须要采用 POST 请求，防止代理服务器日志把敏感数据记录下来
- 前端不得提交 HTML 代码片段，防止被利用产生 XSS 攻击

### 敏感数据处理

- 包含敏感信息的页面，一定不能设置启用 HTTP 缓存，需要调用 `Response.Cache.xxxxxxx()`
- 服务端敏感不得保存到 Application 和 Session 中，因为 Trace 信息中会显示出来
- 日志或者调试信息不得记录敏感信息，比如携程信用卡资料泄露事故

### 操作文件与目录

- 操作文件或者目录，不能直接依据 HTTP 数据来决定路径，应该有明确的目标或者采用白名单方式
- 重要的配置文件不能任由用户下载

### 反射调用

原则：动态的反射调用应该仅针对公开方法或者有确定标记的方法，某些内部方法由于没有权限验证，因此下面的万能调用就能绕过权限检查：

```csharp
//这是一个典型的万能调用，利用反射可以调用任意一个方法，强大的过头了！
string typeName = httpContext.Request.QueryString["class"];
string methodName = httpContext.Request.QueryString["method"];
Type t =Type.GetType(typeName);
MethodInfo method = t.GetMethod(methodName,
                                BindingFlags.Static |
                                BindingFlags.Instance |
                                BindingFlags.Public |
                                BindingFlags.NonPublic);
if( method.IsStatic )
{
    method.Invoke(null, newobject[]  { /* 这里假设没有参数 */});
}
else
{
    object instance =Activator.CreateInstance(t);
    ethod.Invoke(instance, newobject[] { /* 这里假设没有参数 */});
}
```

### MVC Action 数据模型自动绑定

原则：重要的数据成员不得依赖框架自动读取

### .NET 的自身安全机制

原则：不要修改以下的配置项

`<httpRuntime maxRequestLength="4096" enableHeaderChecking="true" />`

- maxRequestLength：是为了防止拒绝服务攻击，不能随意修改它
- enableHeaderChecking：检查 HTTP 标头是否存在注入式攻击

### 正在发版的 ASP.NET 配置

原则：正式发布的配置不允许开启调试功能

```xml
<trace enabled="false"/>
<compilation debug="false">
```
