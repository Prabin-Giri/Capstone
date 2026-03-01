# s012/calculator.py — TESTS: False positive control (completely different code)
# This has NOTHING to do with sorting. Should NOT be flagged against any
# submission. Tests that the detector doesn't produce false positives.

class Calculator:
    """A simple stack-based calculator."""
    
    def __init__(self):
        self.stack = []
        self.history = []
    
    def push(self, value):
        """Push a value onto the stack."""
        self.stack.append(float(value))
    
    def pop(self):
        """Pop and return the top value."""
        if not self.stack:
            raise ValueError("Stack is empty")
        return self.stack.pop()
    
    def add(self):
        """Pop two values, push their sum."""
        b = self.pop()
        a = self.pop()
        result = a + b
        self.push(result)
        self.history.append(f"{a} + {b} = {result}")
        return result
    
    def subtract(self):
        """Pop two values, push their difference."""
        b = self.pop()
        a = self.pop()
        result = a - b
        self.push(result)
        self.history.append(f"{a} - {b} = {result}")
        return result
    
    def multiply(self):
        """Pop two values, push their product."""
        b = self.pop()
        a = self.pop()
        result = a * b
        self.push(result)
        self.history.append(f"{a} * {b} = {result}")
        return result
    
    def divide(self):
        """Pop two values, push their quotient."""
        b = self.pop()
        if b == 0:
            raise ZeroDivisionError("Cannot divide by zero")
        a = self.pop()
        result = a / b
        self.push(result)
        self.history.append(f"{a} / {b} = {result}")
        return result
    
    def peek(self):
        """Return the top value without popping."""
        if not self.stack:
            return None
        return self.stack[-1]
    
    def show_history(self):
        """Print all calculations performed."""
        for entry in self.history:
            print(entry)


def evaluate_expression(expr):
    """Evaluate a postfix expression using the calculator."""
    calc = Calculator()
    tokens = expr.split()
    
    for token in tokens:
        if token in ('+', '-', '*', '/'):
            if token == '+':
                calc.add()
            elif token == '-':
                calc.subtract()
            elif token == '*':
                calc.multiply()
            elif token == '/':
                calc.divide()
        else:
            calc.push(token)
    
    return calc.peek()


if __name__ == "__main__":
    # Test basic operations
    calc = Calculator()
    calc.push(10)
    calc.push(5)
    calc.add()
    print(f"10 + 5 = {calc.peek()}")
    
    calc.push(3)
    calc.multiply()
    print(f"15 * 3 = {calc.peek()}")
    
    # Test expression evaluator
    result = evaluate_expression("3 4 + 2 *")
    print(f"(3 + 4) * 2 = {result}")
    
    calc.show_history()
