import ast
import textwrap
from typing import List, Tuple, Any
from .models import TokenLocation

class ASTTokenVisitor(ast.NodeVisitor):
    def __init__(self, file_path: str, start_line_offset: int = 0):
        self.file_path = file_path
        self.start_line_offset = start_line_offset
        self.tokens: List[str] = []
        self.locations: List[TokenLocation] = []
        
        # Track structural metrics
        self.loops = 0
        self.conditionals = 0
        self.assignments = 0
        self.calls = 0
        self.returns = 0
        self.operators = 0
        
        # Track max depth dynamically through the stack
        self.current_depth = 0
        self.max_depth = 0
        
    def _add_token(self, token_name: str, node: ast.AST):
        self.tokens.append(f"AST_{token_name}")
        # Not all AST nodes have line numbers (e.g. Load(), Store())
        line_num = getattr(node, 'lineno', 1) + self.start_line_offset
        self.locations.append(TokenLocation(
            file_path=self.file_path,
            start_line=line_num,
            end_line=line_num
        ))

    def visit(self, node: ast.AST):
        # We increase depth when entering block-level nodes
        # Use class names instead of isinstance to avoid AttributeError on older pythons
        block_types = ('FunctionDef', 'AsyncFunctionDef', 'ClassDef', 'For', 'AsyncFor', 
                       'While', 'If', 'With', 'AsyncWith', 'Try', 'TryStar', 'ExceptHandler')
        is_block = node.__class__.__name__ in block_types
        if is_block:
            self.current_depth += 1
            self.max_depth = max(self.max_depth, self.current_depth)
            
        super().visit(node)
        
        if is_block:
            self.current_depth -= 1

    # ── Token Generation & Metric Extraction ──

    def visit_For(self, node: ast.For):
        self._add_token("FOR", node)
        self.loops += 1
        self.generic_visit(node)
        
    def visit_AsyncFor(self, node: ast.AsyncFor):
        self._add_token("ASYNCFOR", node)
        self.loops += 1
        self.generic_visit(node)

    def visit_While(self, node: ast.While):
        self._add_token("WHILE", node)
        self.loops += 1
        self.generic_visit(node)

    def visit_If(self, node: ast.If):
        self._add_token("IF", node)
        self.conditionals += 1
        self.generic_visit(node)
        
    def visit_Match(self, node: 'Any'):
        self._add_token("MATCH", node)
        self.conditionals += 1
        self.generic_visit(node)
        
    def visit_match_case(self, node: 'Any'):
        self._add_token("CASE", node)
        self.conditionals += 1
        self.generic_visit(node)

    def visit_Assign(self, node: ast.Assign):
        self._add_token("ASSIGN", node)
        self.assignments += 1
        self.generic_visit(node)
        
    def visit_AnnAssign(self, node: ast.AnnAssign):
        self._add_token("ANNASSIGN", node)
        self.assignments += 1
        self.generic_visit(node)

    def visit_AugAssign(self, node: ast.AugAssign):
        self._add_token("AUGASSIGN", node)
        self.assignments += 1
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call):
        self._add_token("CALL", node)
        self.calls += 1
        self.generic_visit(node)

    def visit_Return(self, node: ast.Return):
        self._add_token("RETURN", node)
        self.returns += 1
        self.generic_visit(node)
        
    def visit_Yield(self, node: ast.Yield):
        self._add_token("YIELD", node)
        self.returns += 1
        # Yield doesn't have a guaranteed lineno in older Pythons if it's purely internal, but usually it does.
        self.generic_visit(node)
        
    def visit_YieldFrom(self, node: ast.YieldFrom):
        self._add_token("YIELDFROM", node)
        self.returns += 1
        self.generic_visit(node)

    # Arithmetic & Logic Operators
    def visit_BinOp(self, node: ast.BinOp):
        self._add_token(f"BINOP_{type(node.op).__name__.upper()}", node)
        self.operators += 1
        self.generic_visit(node)
        
    def visit_BoolOp(self, node: ast.BoolOp):
        self._add_token(f"BOOLOP_{type(node.op).__name__.upper()}", node)
        self.operators += 1
        # Each extra boolean operand increases cyclomatic complexity
        self.conditionals += len(node.values) - 1
        self.generic_visit(node)
        
    def visit_Compare(self, node: ast.Compare):
        self._add_token("COMPARE", node)
        self.operators += len(node.ops)
        self.generic_visit(node)
        
    def visit_UnaryOp(self, node: ast.UnaryOp):
        self._add_token(f"UNARYOP_{type(node.op).__name__.upper()}", node)
        self.operators += 1
        self.generic_visit(node)
        
    # Ignoring raw values, tracking types instead
    def visit_Constant(self, node: ast.Constant):
        if isinstance(node.value, (int, float, complex)):
            self._add_token("NUM", node)
        elif isinstance(node.value, str):
            self._add_token("STR", node)
        elif isinstance(node.value, bool):
            self._add_token("BOOL", node)
        elif node.value is None:
            self._add_token("NONE", node)
        else:
            self._add_token("CONST", node)

    def visit_Name(self, node: ast.Name):
        # We explicitly don't care what the variable is named.
        # But we do care if it is a LOAD or STORE context
        if isinstance(node.ctx, ast.Load):
            self._add_token("VAR_LOAD", node)
        elif isinstance(node.ctx, ast.Store):
            self._add_token("VAR_STORE", node)
        elif isinstance(node.ctx, ast.Del):
            self._add_token("VAR_DEL", node)
            
    def visit_Expr(self, node: ast.Expr):
        # Docstrings and comments are represented as Expr(Constant(str)) in Python 3.8+
        # We don't want them inflating our structural token stream
        # Using getattr to bypass strong typing errors on varying python ast versions
        val_node = getattr(node, 'value', None)
        if isinstance(val_node, ast.Constant):
            inner_val = getattr(val_node, 'value', None)
            if isinstance(inner_val, str):
                return
        self.generic_visit(node)

    # Standard structural nodes that are helpful for fingerprinting
    def visit_FunctionDef(self, node: ast.FunctionDef):
        self._add_token("FUNCDEF", node)
        self.generic_visit(node)
        
    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        self._add_token("ASYNCFUNCDEF", node)
        self.generic_visit(node)
        
    def visit_ClassDef(self, node: ast.ClassDef):
        self._add_token("CLASSDEF", node)
        self.generic_visit(node)
        
    def visit_ListComp(self, node: ast.ListComp):
        self._add_token("LISTCOMP", node)
        self.loops += len(node.generators)
        self.generic_visit(node)
        
    def visit_DictComp(self, node: ast.DictComp):
        self._add_token("DICTCOMP", node)
        self.loops += len(node.generators)
        self.generic_visit(node)
        
    def visit_SetComp(self, node: ast.SetComp):
        self._add_token("SETCOMP", node)
        self.loops += len(node.generators)
        self.generic_visit(node)
        
    def visit_GeneratorExp(self, node: ast.GeneratorExp):
        self._add_token("GENEXP", node)
        self.loops += len(node.generators)
        self.generic_visit(node)
        
    def visit_comprehension(self, node: ast.comprehension):
        # Comprehension IFs increase cyclomatic complexity
        self.conditionals += len(node.ifs)
        self.generic_visit(node)


def ast_parse_function(func_text: str, file_path: str, start_line: int) -> Tuple[List[str], List[TokenLocation], dict]:
    """
    Parses a python function string into AST, extracts tokens and structural metrics.
    
    Returns:
        (tokens, locations, metrics_dict)
    """
    try:
        # Standardize indentation using textwrap.dedent instead of lstrip() to handle all lines appropriately
        dedented_text = textwrap.dedent(func_text)
        tree = ast.parse(dedented_text)
    except SyntaxError:
        # If the code is unparseable python, we just return empty
        return [], [], {
            "loops": 0, "conditionals": 0, "assignments": 0, "calls": 0,
            "returns": 0, "operators": 0, "max_nesting": 0
        }

    visitor = ASTTokenVisitor(file_path=file_path, start_line_offset=start_line - 1)
    visitor.visit(tree)
    
    metrics = {
        "loops": visitor.loops,
        "conditionals": visitor.conditionals,
        "assignments": visitor.assignments,
        "calls": visitor.calls,
        "returns": visitor.returns,
        "operators": visitor.operators,
        "max_nesting": visitor.max_depth
    }
    
    return visitor.tokens, visitor.locations, metrics
