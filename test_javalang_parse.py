import javalang
code = """
import java.util.*;
public class Main {
    public static void foo() {}
}
"""
try:
    tree = javalang.parse.parse(code)
    print("Parsed as full unit!")
except Exception as e:
    print("Failed as full unit:", type(e))

code_method = """
public static void foo() {}
"""
try:
    tree2 = javalang.parse.parse(code_method)
    print("Parsed method as full unit?!")
except Exception as e:
    print("Failed method as full unit, as expected:", type(e))
    try:
        tree3 = javalang.parse.parse(f"class Dummy {{\n{code_method}\n}}")
        print("Parsed method in dummy class!")
    except Exception as e:
        print("Failed dummy:", type(e))
