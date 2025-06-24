#ifndef CODE_H
#define CODE_H

// Example header file

#include <string>
#include <vector>

class ExampleClass {
public:
    ExampleClass();
    ~ExampleClass();

    void setName(const std::string& name);
    std::string getName() const;

    void addValue(int value);
    std::vector<int> getValues() const;

private:
    std::string name;
    std::vector<int> values;
};

#endif // CODE_H