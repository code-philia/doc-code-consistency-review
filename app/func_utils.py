import json
import re
from docxtpl import DocxTemplate
from sqlalchemy import create_engine, text
from .db import DB_CONFIG

MODEL_CONFIG = {
    "modelA": {"name": "qwen3.8-27b", "url": "http://10.123.0.196:6025/v1"},
    "modelB": {"name": "qwen3.8-27b-w8a8", "url": "http://10.123.0.196:1025/v1"}
}

OPERATION_TYPES = {
    1: '需求反生成',
    2: '自动审查',
    3: '自动对齐 代码=>需求',
    4: '自动对齐 需求=>代码',
    5: '模型切换'
}


def get_model_data(model_type):
    data = {
        "name": MODEL_CONFIG['modelA']['name'],
        "url": MODEL_CONFIG[model_type]['url'],
    }
    if model_type in MODEL_CONFIG:
        data["name"] = MODEL_CONFIG[model_type]['name']
        data["url"] = MODEL_CONFIG[model_type]['url']

    return data


def record_user_operation(operation_type, current_user, logger, get_db, change_model=None):
    """
    通用操作日志记录函数。
    - operation_type: int，对应 OPERATION_TYPES 中的键。
    - 从会话中获取当前用户和模型key。
    - 日志写入失败不影响主业务。
    """
    try:
        # 获取当前登录用户信息，
        if not current_user.is_authenticated:
            logger.warning("记录操作日志失败：用户未认证")
            return False
        username = current_user.username
        userid = current_user.user_id
        model_key = current_user.default_model_key
        if not username or not model_key:
            logger.warning("记录操作日志失败：用户信息不完整")
            return False
        model_name = MODEL_CONFIG.get(model_key)['name']
        db = get_db()
        cursor = db.cursor()
        try:
            sql = """
                INSERT INTO user_operation_log (user_id, username, operation_type, model_key)
                VALUES (%s, %s, %s, %s)
            """
            operation_type_name = OPERATION_TYPES.get(operation_type)
            if change_model:
                change_model = MODEL_CONFIG.get(change_model)['name']
                # operation_type_name = f"{OPERATION_TYPES.get(operation_type)}到{change_model}"
                model_name = f"{model_name} —> {change_model}" 
            cursor.execute(sql, (userid, username, operation_type_name, model_name))
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            logger.error(f"写入操作日志失败: {e}")
            return False
        finally:
            cursor.close()
    except Exception as e:
        logger.error(f"记录操作日志异常: {e}")
        return False


def get_alignments_by_project(project_id):
    """
    通过project_id 从alignments表中获取数据
    """
    db_url = f"mysql+pymysql://{DB_CONFIG['user']}:{DB_CONFIG['password']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}"

    engine = create_engine(
        db_url,
        echo=False,
        pool_pre_ping=True
    )
    # AND(is_alignment=1 or (is_code_review = 1 and isReviewed = 1))
    query_sql = text("""
            SELECT name, docRanges, codeRanges
            FROM alignments
            WHERE project_id = :project_id AND align_type = :align_type
        """)

    with engine.connect() as conn:
        result = conn.execute(query_sql, {"project_id": project_id, "align_type": "req2code"})
        rows = result.fetchall()
        return [dict(row._mapping) for row in rows]


def _normalize(ranges):
    """兼容两种形态：已解析的 list，或字符串形式的 JSON（如 '[]'）。"""
    if isinstance(ranges, str):
        try:
            ranges = json.loads(ranges)
        except json.JSONDecodeError:
            return []
    if not isinstance(ranges, list):
        return []
    return ranges


def extract_range_info(collection):
    """
    遍历集合中每个条目：
      - 取 codeRanges 第一个元素的 filename / startLine / endLine
      - 若 docRanges 有数据（结构同 codeRanges），取第一个元素的 filename
    无对应数据时对应字段为 None。
    """
    results = []
    for item in collection:
        code_ranges = _normalize(item.get("codeRanges", []))
        doc_ranges = _normalize(item.get("docRanges", []))

        entry = {
            "name": item.get("name"),
            "code_filename": None,
            "start_line": None,
            "end_line": None,
            "doc_filename": None,
        }
        if code_ranges:
            first = code_ranges[0]
            entry["code_filename"] = first.get("filename")
            entry["start_line"] = first.get("startLine")
            entry["end_line"] = first.get("endLine")
            content_list = []
            for code in code_ranges:
                code.get("content")
                content_list.append(
                    {
                        "content": code.get("content"),
                        "filename": code.get("filename"),
                    }
                )
            entry["content"] = content_list
        if doc_ranges:
            entry["doc_filename"] = doc_ranges[0].get("filename")
        results.append(entry)
    return results


def group_by_doc_filename(collection, default_key="no_doc"):
    """
    复用 extract_range_info 的提取结果，按 doc_filename 分组：
      - key = 每个条目的 doc_filename（docRanges 首元素 filename）
      - doc_filename 为空的条目归入 default_key 桶
    返回 {doc_filename: [条目, ...], ...}
    """
    grouped = {}
    for entry in extract_range_info(collection):
        key = entry["doc_filename"] or default_key
        grouped.setdefault(key, []).append(entry)
    return grouped


# test
def build_tables():
    """
    构造 docxtpl 的 tables 结构。
    注意：返回的是【列表】，每个元素是 {table_title, rows}，
    与模板中的 {% for t in tables %} / {{ t.table_title }} / t.rows 一一对应。
    （模板用的是 table_title 这个键名，不要写成 title）
    """
    from docxtpl import DocxTemplate

    # 核心数据结构：tables 列表里有几个字典，最终就会生成几个表格
    tables = [
        {
            'table_title': '软件需求规格说明.docx',  # 表格1的标题
            'rows': [                                # 表格1的数据行
                {'source': '3.2.2.6.1 自检功能（环）', 'func': 'InitAll()，()，()，()'},
                {'source': '3.2.2.9 模拟功能', 'func': 'InitVar()\nQiShu153B()'}  # \n 自动换行
            ]
        },
        {
            'table_title': '软件设计说明.docx',       # 表格2的标题
            'rows': [                                 # 表格2的数据行
                {'source': '3.2.2.10 目标功能', 'func': 'XXX()'},
                {'source': '1.3.2 软件地址功能', 'func': 'XXX153()'}
            ]
        }
        # 你可以继续添加表格3、表格4... 它们都会自动生成
    ]
    context = {
        "doc_title":"test",
        "tables":tables
    }
    return context


def render_doc(context, template_file, output_file):
    doc = DocxTemplate(template_file)
    # autoescape=True：保证 &、< 等 XML 特殊字符在渲染时被正确转义（docxtpl 默认会吞掉）
    doc.render(context, autoescape=True)
    doc.save(output_file)
    return output_file


def get_elements_until_same(lst):
    """
    当第N个元素和N+1元素相同时，获取0到N的元素
    """
    if len(lst) < 2:
        return lst

    for n in range(len(lst) - 1):
        if lst[n] == lst[n + 1]:
            return lst[:n + 1]

    return lst


# C 语言关键字：过滤掉可能被误捕获的名称
_C_KEYWORDS = {
    'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
    'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
    'inline', 'int', 'long', 'register', 'restrict', 'return', 'short',
    'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union',
    'unsigned', 'void', 'volatile', 'while',
    '_Bool', '_Complex', '_Imaginary', '_Noreturn', '_Static_assert',
    '_Thread_local', '_Atomic', '_Alignas', '_Alignof', '_Generic',
}

# C++ 关键字：同样过滤（static_assert/decltype/typeid 等会以“名字+()”形式出现）
_CPP_KEYWORDS = {
    'alignas', 'alignof', 'catch', 'char8_t', 'char16_t', 'char32_t', 'class',
    'co_await', 'co_return', 'co_yield', 'concept', 'consteval', 'constexpr',
    'constinit', 'decltype', 'delete', 'explicit', 'export', 'friend',
    'import', 'module', 'mutable', 'namespace', 'new', 'noexcept', 'nullptr',
    'operator', 'private', 'protected', 'public', 'requires', 'static_assert',
    'template', 'this', 'thread_local', 'throw', 'try', 'typeid', 'typename',
    'using', 'virtual', 'wchar_t',
}

_KEYWORDS = _C_KEYWORDS | _CPP_KEYWORDS

# 以这些关键字开头的行不可能是函数声明/定义/调用（控制流语句等）
_CONTROL_KEYWORDS = (
    'if|while|for|switch|return|else|do|goto|case|default|sizeof'
    '|catch|try|throw'
)

# 返回类型前缀允许的字符（C++ 类型语法）：
#   单词、空白、指针 *、引用 &、作用域 ::、模板 < >、模板参数逗号 ,、属性 (...) 如 __declspec(...)
_TYPE_PREFIX = r'[\w\s*&:<>,()]*?'

# 函数名：
#   C：add
#   C++ 限定名：std::swap、Foo::bar
#   析构函数：~Foo、Foo::~Foo
_DEF_NAME = r'~?\w+(?:::[~]?\w+)*'
_CALL_NAME = r'\w+(?:::\w+)*'

# 运算符重载名：operator() [] -> ->* new[] delete[] 各类符号及转换运算符（operator bool 等）
_OPERATOR_NAME = (
    r'operator\s*(?:'
    r'\(\)|\[\]|->\*?|<=>|<<=|>>=|==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|/=|%=|&=|\|=|\^=|<<|>>'
    r'|[-+*/%&|^~!<>=]'
    r'|new\s*\[\]?|delete\s*\[\]?'
    r'|(?:const\s+)?\w+(?:::\w+)*'
    r')'
)

# 定义尾部（参数列表右括号之后）：
#   可选限定符（任意顺序）：const / volatile / noexcept[(...)] / override / final / & / &&
#   可选尾置返回类型：-> 类型
#   可选构造函数初始化列表：: a_(0), b_(1)
#   最后是函数体 {
_DEF_TAIL = (
    r'\)\s*'
    r'(?:(?:const|volatile|noexcept(?:\s*\([^;{}]*?\))?|override|final|&&?)\s*)*'
    r'(?:->[^;{}]*?)?'
    r'(?::[^;{}]*?)?'
    r'\s*\{'
)

# 函数名匹配模式（覆盖定义 / 调用，排除声明）：
#   ^(?!...)                             行首先排除控制流关键字（独立吃缩进，防 \s* 回溯绕过）
#   \s*                                  行首缩进
#   (?: 分支1：函数定义                    任意返回类型（含 C++ 类型语法）+ 函数名 + (参数) + 尾部 + {
#         [\w\s*&:<>,()]*?(?<!\w)(名字)\s*\(\s*(?!\*)参数（括号配对）限定符…->…:…{
#     | 分支2：函数调用                    无返回类型前缀 + 函数名 + (参数) + ;
#         (?<!\w)(名字)\s*\(\s*(?!\*)[^;{}]*?\)\s*;
#     )
#   `(?<!\w)` 防止吞掉类型名片段；`\(\s*(?!\*)` 排除函数指针变量 int (*fp)(int);
_FUNC_PATTERN = re.compile(
    r'^'
    + r'(?![ \t]*(?:' + _CONTROL_KEYWORDS + r')\b)'
    + r'\s*'
    + r'(?:'
    + r'[\w\s*&:<>,()]*?(?<!\w)((?:' + _OPERATOR_NAME + r'|' + _DEF_NAME + r'))\s*\(\s*(?!\*)(?:[^;{}()]|\([^;{}()]*\))*?' + _DEF_TAIL
    + r'|'
    + r'(?<!\w)(' + _CALL_NAME + r')\s*\(\s*(?!\*)[^;{}]*?\)\s*;'
    + r')',
    re.MULTILINE,
)


def _strip_strings_and_comments(code: str) -> str:
    """去掉字符串/字符字面量和注释，防止其中的伪代码被误解析。"""
    # C++ 原始字符串字面量 R"delim(...)delim"（含 u8R/LR/uR/UR 前缀），须在普通字符串之前处理
    code = re.sub(
        r'(?:u8|u|U|L)?R"[^"()\\\r\n]*\(.*?\)[^"()\\\r\n]*"',
        lambda m: ' ' * len(m.group(0)),
        code,
        flags=re.DOTALL,
    )
    # 字符串与字符字面量（含转义），替换为等长空白以保留行列位置
    code = re.sub(
        r'"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'',
        lambda m: ' ' * len(m.group(0)),
        code,
    )
    # 行注释
    code = re.sub(r'//.*?$', '', code, flags=re.MULTILINE)
    # 块注释（可跨行），同样替换为等长空白
    code = re.sub(
        r'/\*.*?\*/',
        lambda m: ' ' * len(m.group(0)),
        code,
        flags=re.DOTALL,
    )
    return code


def _strip_preprocessor_lines(code: str) -> str:
    """删除预处理指令行（C 的 # 开头、Verilog 的 ` 开头，含反斜杠续行）。"""
    lines = code.splitlines()
    out = []
    skip = False
    for line in lines:
        if skip:
            if line.rstrip().endswith('\\'):
                continue  # 宏续行，继续跳过
            skip = False
            continue
        if re.match(r'^\s*[#`]', line):
            skip = line.rstrip().endswith('\\')
            continue
        out.append(line)
    return '\n'.join(out)


def _mask_function_bodies(code: str) -> tuple[str, list[tuple[int, str]]]:
    """
    把每个函数定义体 {...} 整段替换为等长空白。

    返回 (屏蔽后的代码, [(起始位置, 函数名), ...])。
    屏蔽后，函数体内的调用（如 std::swap）不再可见，
    只有顶层的独立调用仍可被解析。
    """
    buf = list(code)
    def_spans: list[tuple[int, str]] = []
    n = len(code)
    for m in _FUNC_PATTERN.finditer(code):
        def_name = m.group(1)
        if def_name is None:
            continue  # 这是调用匹配，保留在顶层代码中
        def_spans.append((m.start(), def_name))
        brace = m.end() - 1  # 定义签名以 { 结尾
        depth = 1
        j = brace + 1
        while j < n and depth > 0:
            c = code[j]
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
            j += 1
        for k in range(m.start(), j):
            buf[k] = ' '
    return ''.join(buf), def_spans


def extract_func_names_regex(code: str) -> list[str]:
    """
    从 C/C++ 代码字符串中解析出函数名：

    - 函数定义（含函数体 {...} 的）：解析
    - 顶层函数调用（不在任何函数体内，如单独一行的 bubbleSort(arr);）：解析
    - 函数体内部的调用（如 std::swap(arr[i], arr[i+1])）：不解析

    注意：函数声明/原型（int func_proto(int);，无函数体且带返回类型）不会匹配。

    C++ 支持：
    - 限定名：std::swap、Foo::bar、Foo::~Foo
    - 作用域/模板返回类型：std::string、std::vector<int>、std::map<std::string,int>
    - 引用返回类型：int&、const std::string&、Foo&&
    - 尾随限定符：const / volatile / noexcept[(...)] / override / final / & / &&
    - 尾置返回类型：auto f() -> int
    - 构造函数初始化列表：Foo::Foo() : a_(0)
    - 运算符重载：operator==、operator()、operator new、operator bool 等
    - __declspec(...) / __attribute__((...)) 等属性前缀
    - C++ 原始字符串字面量 R"(...)" 中的伪代码会被忽略

    已知限制（纯正则方案的固有边界）：
    - 只匹配位于行首/语句起始位置的函数名，`x = foo(1);`、`if (x) foo();`
      这类嵌在表达式或控制流中的调用不会匹配
    - 不匹配带显式模板实参的调用/特化（如 std::max<int>(a, b)、max<int>(...){...}）
    - 不匹配返回函数指针的复杂声明（如 int (*f(int))(void) { ... }）
    - 参数默认值含花括号（如 v = {1,2}）时该定义不匹配
    - 参数类型含嵌套括号（如 std::function<void(int(*)(int))>）时该定义不匹配
    - 函数体必须闭合（{} 配对），否则其后代码会被一并屏蔽
    """
    cleaned = _strip_strings_and_comments(code)
    cleaned = _strip_preprocessor_lines(cleaned)
    masked, def_spans = _mask_function_bodies(cleaned)
    # 屏蔽后在剩余顶层代码上找调用
    call_spans: list[tuple[int, str]] = []
    for m in _FUNC_PATTERN.finditer(masked):
        call_name = m.group(2)
        if call_name:
            call_spans.append((m.start(), call_name))
    # 按源码出现位置合并，保持顺序
    spans = sorted(def_spans + call_spans)
    names = [name for _, name in spans]
    return [name for name in names if name not in _KEYWORDS]


# ============ Verilog 命名实体（module / function / task） ============

# module <name> (端口列表) 或 module <name>;
_VERILOG_MODULE_RE = re.compile(r'^\s*module\s+(\w+)', re.MULTILINE)

# function <name>; / function [7:0] <name>; / function void <name>(...);
# 取行内 [;(] 之前最后一个标识符作为函数名
_VERILOG_FUNC_RE = re.compile(
    r'^\s*function\b\s+([^;(\n]*?)\b(\w+)\s*[;(]',
    re.MULTILINE,
)

# task <name>; / task automatic <name>;
_VERILOG_TASK_RE = re.compile(
    r'^\s*task\b\s+(?:(?:automatic|static)\s+)*(\w+)',
    re.MULTILINE,
)


def _dedupe(names: list[str]) -> list[str]:
    """保序去重（VHDL 的 package 与 package body 同名，只保留一次）。"""
    seen = set()
    out = []
    for n in names:
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out


def extract_verilog_names(code: str) -> list[str]:
    """
    从 Verilog / SystemVerilog 代码中解析命名实体：

    - module：    module adder(input [7:0] a, ...);
    - function：  function [7:0] add_bytes; / function void print_it(...);
    - task：      task do_something;

    说明：
    - 支持 `` `include``/`` `timescale``/`` `define`` 等反引号预处理指令的剔除
    - 忽略 // 与 /* */ 注释、字符串字面量中的伪代码
    - 结果保序去重
    已知限制：不支持 class/interface/program 等 SystemVerilog 高级封装内的
    方法提取（method 名不在此范围）。
    """
    cleaned = _strip_strings_and_comments(code)
    cleaned = _strip_preprocessor_lines(cleaned)
    names: list[str] = []
    names += _VERILOG_MODULE_RE.findall(cleaned)
    names += [m[1] for m in _VERILOG_FUNC_RE.findall(cleaned)]
    names += _VERILOG_TASK_RE.findall(cleaned)
    return _dedupe(names)


# ============ VHDL 命名实体（entity / architecture / function / procedure / package） ============

# entity <name> is
_VHDL_ENTITY_RE = re.compile(r'^\s*entity\s+(\w+)\s+is\b', re.MULTILINE)

# architecture <name> of <entity> is
_VHDL_ARCH_RE = re.compile(r'^\s*architecture\s+(\w+)\s+of\b', re.MULTILINE)

# [pure|impure] function <name> [(参数)] return <类型> is   —— 仅定义（含 is），声明（; 结尾）不匹配
_VHDL_FUNC_RE = re.compile(
    r'^\s*(?:pure\s+|impure\s+)?function\s+(\w+)'
    r'\s*(?:\([^)]*?\))?\s+return\b[^;]*?\bis\b',
    re.MULTILINE,
)

# procedure <name> [(参数)] is   —— 仅定义（含 is）
_VHDL_PROC_RE = re.compile(
    r'^\s*procedure\s+(\w+)\s*(?:\([^)]*?\))?\s+is\b',
    re.MULTILINE,
)

# package <name> is / package body <name> is
_VHDL_PKG_RE = re.compile(
    r'^\s*package\s+(?:body\s+)?(\w+)\s+is\b',
    re.MULTILINE,
)


def extract_vhdl_names(code: str) -> list[str]:
    """
    从 VHDL 代码中解析命名实体：

    - entity：        entity adder is
    - architecture：  architecture behavior of adder is
    - function：      function add_bytes(a : integer) return integer is
                      （纯函数/非纯函数 pure/impure 前缀同样支持；无参函数支持）
    - procedure：     procedure do_something(a : in integer) is
    - package：       package my_pkg is / package body my_pkg is

    说明：
    - 与 C/C++ 一致：function/procedure 的声明（无 is、以 ; 结尾）不匹配，仅匹配定义
    - 忽略 -- 行注释与 "..." 字符串中的伪代码
    - 结果保序去重（package 与 package body 同名只保留一次）
    已知限制：不提取 type/subtype/component/configuration/process/block 等
    其他命名实体（非“函数类”）。
    """
    cleaned = _strip_strings_and_comments(code)
    # VHDL 行注释是 --，在字符串已被剔除后安全删除
    cleaned = re.sub(r'--.*?$', '', cleaned, flags=re.MULTILINE)
    names: list[str] = []
    names += _VHDL_ENTITY_RE.findall(cleaned)
    names += _VHDL_ARCH_RE.findall(cleaned)
    names += _VHDL_FUNC_RE.findall(cleaned)
    names += _VHDL_PROC_RE.findall(cleaned)
    names += _VHDL_PKG_RE.findall(cleaned)
    return _dedupe(names)


def extract_names_by_language(code: str, language: str) -> list[str]:
    """按语言分派解析命名实体。language 支持：c/cpp/c++、verilog/systemverilog、vhdl。"""
    lang = language.strip().lower().replace('_', '').replace('.', '')
    if lang in ('c', 'cpp', 'c++', 'cc', 'cxx', 'c11', 'c17'):
        return extract_func_names_regex(code)
    if lang in ('verilog', 'systemverilog', 'sv', 'v'):
        return extract_verilog_names(code)
    if lang in ('vhdl', 'vhd'):
        return extract_vhdl_names(code)
    raise ValueError(
        f"不支持的语言: {language!r}（支持 c / cpp / c++ / verilog / systemverilog / vhdl）"
    )


# 解析mermaid
def check_node_level(mermaid_code: str, target_name: str, level: int) -> bool:
    """
    判断指定名称的节点是否属于指定的层级。

    :param mermaid_code: Mermaid 流程图的原始字符串
    :param target_name: 需要判断的节点显示名称（如 "main", "bubbleSort"）
    :param level: 期望判断的层级，仅支持 "1" 或 "-1"
    :return: 匹配返回 True，不匹配、属于中间层级或未找到名称均返回 False
    """
    # 参数校验：只处理第一层次和最后层次
    if level not in [1, -1]:
        return False

    # 1. 过滤注释（%% 开头）与关键字行（subgraph/style/classDef/flowchart 等不属于数据节点）
    skip_keywords = ('subgraph', 'end', 'style', 'classdef', 'flowchart', 'graph',
                     'direction', 'click', 'linkstyle')
    lines = []
    for raw in mermaid_code.splitlines():
        line = raw.split('%%', 1)[0].strip()
        if not line:
            continue
        head = line.split()[0].lower() if line.split() else ''
        if head in skip_keywords:
            continue
        lines.append(line)
    code = '\n'.join(lines)

    # 2. 统一箭头形式（虚线 -.-> / 粗线 ==> / 带标签 -->|text| / 带文本 -- text -->）
    code = re.sub(r'-\.-\s*>', '-->', code)                 # -.-> / -.- >
    code = re.sub(r'==+\s*>', '-->', code)                  # ==> / ===>
    code = re.sub(r'-->\s*\|[^|\n]*\|', '-->', code)        # -->|label|
    code = re.sub(r'--\s+[^>\n]*?\s+-->', '-->', code)      # -- text -->
    code = re.sub(r'-\.\s+[^>\n]*?\s+\.->', '-->', code)    # -. text .->
    code = re.sub(r'==+\s+[^>\n]*?\s+==+>', '-->', code)    # === text ===>

    id_to_name = {}
    in_degree = {}
    out_degree = {}

    # 3. 提取所有节点及名称映射
    #    支持方框 [...], 菱形 {...}, 圆角 (...), 圆形 ((...)), 不对称 >...], 带引号 ID
    node_pattern = re.compile(r'\"?([\w\u4e00-\u9fff][\w\-\.\u4e00-\u9fff]*)\"?\s*([\[({>])')
    for match in node_pattern.finditer(code):
        node_id = match.group(1)
        shape = match.group(2)
        pos = match.end() - 1
        # 双括号形状 ((...)) / [[...]]
        doubled = pos + 1 < len(code) and code[pos + 1] == shape
        start = pos + 2 if doubled else pos + 1
        close_ch = ']' if shape in '[>' else ')' if shape == '(' else '}'
        end = code.find(close_ch, start)
        label = code[start:end] if end != -1 else code[start:]
        label = label.strip().strip('"').strip("'")
        # 去掉 <br> / <br/> 及其后的文件位置等信息
        label = re.split(r'<br\s*/?>', label, flags=re.I)[0].strip()
        if node_id not in id_to_name:
            id_to_name[node_id] = label
            in_degree[node_id] = 0
            out_degree[node_id] = 0

    # 4. 剥离节点定义 -> 裸 ID，避免链式边（A --> B --> C）与节点标签干扰边缘匹配
    stripped = re.sub(
        r'\"?([\w\u4e00-\u9fff][\w\-\.\u4e00-\u9fff]*)\"?\s*[\[({>]{1,2}[^\[\]\(\){}>\n]*[\]\)}>]{1,2}',
        r'\1', code)
    # 去掉 ::: 类名赋值（A["x"]:::class --> B）
    stripped = re.sub(r':::\s*[\w\u4e00-\u9fff][\w\-\.\u4e00-\u9fff]*', '', stripped)

    # 5. 提取连接关系并统计入度/出度
    #    使用 lookahead 支持链式边；兼容引号包裹的节点 ID
    edge_pattern = re.compile(
        r'(?=(\"?[\w\u4e00-\u9fff][\w\-\.\u4e00-\u9fff]*\"?)\s*-->\s*'
        r'(\"?[\w\u4e00-\u9fff][\w\-\.\u4e00-\u9fff]*\"?))')
    for match in edge_pattern.finditer(stripped):
        source_id = match.group(1).strip('"')
        target_id = match.group(2).strip('"')
        # 边缘中出现的未定义节点：以 ID 本身作为显示名
        for uid in (source_id, target_id):
            if uid not in id_to_name:
                id_to_name[uid] = uid
                in_degree[uid] = 0
                out_degree[uid] = 0
        out_degree[source_id] += 1
        in_degree[target_id] += 1

    # 6. 查找目标名称对应的所有节点ID
    target_ids = [uid for uid, name in id_to_name.items() if name == target_name]
    if not target_ids:
        return False

    # 7. 逐个检查同名节点，只要有一个满足条件即返回 True
    for uid in target_ids:
        if level == 1 and in_degree[uid] == 0:
            return True
        if level == -1 and out_degree[uid] == 0:
            return True

    return False


if __name__ == "__main__":
    # TEMPLATE_FILE = r"C:\lsh\Dev\tmp\doc-code\templates\需求表格.docx"
    # OUTPUT_FILE = r'C:\lsh\Dev\tmp\out_test.docx'
    # temp_table = build_tables()
    # render_doc(temp_table, TEMPLATE_FILE, OUTPUT_FILE)

    test_data = """
    flowchart LR
    n_main_cpp_11_main["main<br/>main.cpp:11"]
    n_sorting_algorithms_cpp_4_bubbleSort["bubbleSort<br/>sorting_algorithms.cpp:4"]
    n_string_algorithms_cpp_5_reverseString["reverseString<br/>string_algorithms.cpp:5"]
    subgraph callees_side[" "]
        direction TB
        n_sorting_algorithms_cpp_4_bubbleSort
        n_string_algorithms_cpp_5_reverseString
    end
    n_main_cpp_11_main --> n_sorting_algorithms_cpp_4_bubbleSort
    n_main_cpp_11_main --> n_string_algorithms_cpp_5_reverseString
    classDef hidden fill:transparent,stroke:transparent,color:transparent;
    style callees_side fill:transparent,stroke:transparent,color:transparent;
    callees_anchor[" "]5422,stroke-width:2px,color:#3c2415;
    class n_main_cpp_11_main center
    class callees_anchor hidden
    n_main_cpp_11_main --> callees_anchor
    linkStyle 2 stroke:transparent,color:transparent,fill:none,stroke-width:0px;
    classDef center fill:#f8dcc8,stroke:#b5
    """
    bool_value = check_node_level(test_data, 'main', 1)
    print(bool_value)

    temp_data = """
    -- Copyright 2024
-- Entity: d_ff
-- Description: D flip-flop

library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity d_ff is
	port (
		clk : in std_logic;
		d   : in std_logic;
		q   : out std_logic
	);
end entity;

architecture rtl of d_ff is
begin
	process(clk)
	begin
		if rising_edge(clk) then
			q <= d;
		end if;
	end process;
end architecture;
    """

    temp_value = extract_names_by_language(temp_data, "vhd")
    print(temp_value)