import javalang
from typing import List, Tuple
from .models import TokenLocation

class JavaASTVisitor:
    def __init__(self, file_path: str, start_line_offset: int = 0):
        self.file_path = file_path
        self.start_line_offset = start_line_offset
        self.tokens: List[str] = []
        self.locations: List[TokenLocation] = []

        # Structural metrics
        self.loops = 0
        self.conditionals = 0
        self.assignments = 0
        self.calls = 0
        self.returns = 0
        self.operators = 0

        self.current_depth = 0
        self.max_depth = 0

    def _add_token(self, token_name: str, node):
        self.tokens.append(f"AST_{token_name}")
        # Extract line number from the javalang position object if available
        line_num = getattr(node.position, 'line', 1) if getattr(node, 'position', None) else 1
        line_num += self.start_line_offset
        self.locations.append(TokenLocation(
            file_path=self.file_path,
            start_line=line_num,
            end_line=line_num
        ))

    def process(self, tree):
        self._visit(tree)

    def _visit(self, node):
        if node is None:
            return

        is_node = isinstance(node, javalang.ast.Node)
        
        # Block tracking for nesting depth
        is_block = isinstance(node, (javalang.tree.BlockStatement, javalang.tree.ForStatement, 
                                     javalang.tree.WhileStatement, javalang.tree.DoStatement, 
                                     javalang.tree.IfStatement, javalang.tree.TryStatement, 
                                     javalang.tree.CatchClause, javalang.tree.SwitchStatement))
        if is_block:
            self.current_depth += 1
            self.max_depth = max(self.max_depth, self.current_depth)

        if is_node:
            self._handle_node(node)

        # Traverse children
        if is_node:
            for child in node.children:
                if isinstance(child, list):
                    for item in child:
                        if isinstance(item, javalang.ast.Node):
                            self._visit(item)
                elif isinstance(child, javalang.ast.Node):
                    self._visit(child)

        if is_block:
            self.current_depth -= 1

    def _handle_node(self, node):
        # Loops
        if isinstance(node, javalang.tree.ForStatement) or isinstance(node, javalang.tree.ForControl):
            self._add_token("FOR", node)
            self.loops += 1
        elif isinstance(node, javalang.tree.WhileStatement):
            self._add_token("WHILE", node)
            self.loops += 1
        elif isinstance(node, javalang.tree.DoStatement):
            self._add_token("DO_WHILE", node)
            self.loops += 1

        # Conditionals
        elif isinstance(node, javalang.tree.IfStatement):
            self._add_token("IF", node)
            self.conditionals += 1
        elif isinstance(node, javalang.tree.SwitchStatement):
            self._add_token("SWITCH", node)
            self.conditionals += 1
        elif isinstance(node, javalang.tree.SwitchStatementCase):
            self._add_token("CASE", node)
            self.conditionals += 1
        elif isinstance(node, javalang.tree.TernaryExpression):
            self._add_token("TERNARY", node)
            self.conditionals += 1

        # Assignments
        elif isinstance(node, javalang.tree.Assignment):
            self._add_token("ASSIGN", node)
            self.assignments += 1
        elif isinstance(node, javalang.tree.VariableDeclarator):
            self._add_token("VAR_DECL", node)
            if node.initializer:
                self.assignments += 1

        # Variable Access
        elif isinstance(node, javalang.tree.MemberReference):
            self._add_token("VAR_ACCESS", node)

        # Calls and Returns
        elif isinstance(node, javalang.tree.MethodInvocation):
            self._add_token("CALL", node)
            self.calls += 1
        elif isinstance(node, javalang.tree.ReturnStatement):
            self._add_token("RETURN", node)
            self.returns += 1

        # Operators
        elif isinstance(node, javalang.tree.BinaryOperation):
            self._add_token(f"BINOP_{node.operator}", node)
            self.operators += 1
            if node.operator in ('&&', '||'):
                self.conditionals += 1 # Adds to cyclomatic complexity

        # Literals and Types
        elif isinstance(node, javalang.tree.Literal):
            if node.value is not None:
                if node.value.startswith('"') or node.value.startswith("'"):
                    self._add_token("STR", node)
                elif node.value in ('true', 'false'):
                    self._add_token("BOOL", node)
                elif node.value == 'null':
                    self._add_token("NULL", node)
                else:
                    self._add_token("NUM", node)
        
        # Structural 
        elif isinstance(node, (javalang.tree.ClassDeclaration, javalang.tree.InterfaceDeclaration)):
            self._add_token("CLASSDEF", node)
        elif node.__class__.__name__ == 'RecordDeclaration':
            self._add_token("RECORDDEF", node)
        elif isinstance(node, javalang.tree.MethodDeclaration):
            self._add_token("METHODDEF", node)


def java_ast_parse_function(func_text: str, file_path: str, start_line: int) -> Tuple[List[str], List[TokenLocation], dict]:
    """
    Parses a Java function sequence into an AST, extracts tokens and structural metrics.
    Attempts to parse as a full compilation unit first (for full generic files),
    then falls back to wrapping in a DummyClass if the snippet is just a method.
    """
    start_offset = start_line - 1
    
    try:
        # Try as a full compilation unit first (handles package/import statements gracefully)
        tree = javalang.parse.parse(func_text)
    except (javalang.parser.JavaSyntaxError, javalang.tokenizer.LexerError, Exception):
        # Fallback to wrapping the method in a dummy class
        dummy_class = f"class DummyClass {{\n{func_text}\n}}"
        try:
            tree = javalang.parse.parse(dummy_class)
            start_offset = start_line - 2
        except Exception:
            # Complete parse failure
            return [], [], {
                "loops": 0, "conditionals": 0, "assignments": 0, "calls": 0,
                "returns": 0, "operators": 0, "max_nesting": 0
            }

    visitor = JavaASTVisitor(file_path=file_path, start_line_offset=start_offset)
    visitor.process(tree)

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
