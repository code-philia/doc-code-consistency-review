#include <iostream>

// A simple function to add two numbers
int add(int a, int b) {
    return a + b;
}

int main() {
    int num1 = 5, num2 = 10;
    std::cout << "The sum of " << num1 << " and " << num2 << " is " << add(num1, num2) << std::endl;
    return 0;
}