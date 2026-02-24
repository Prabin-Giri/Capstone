# Starter Code

def is_leap(year):
    # TODO: Return True if year is a leap year, otherwise False
    pass


def next_20_leap_years(start_year):
    # TODO: Return a list of the next 20 leap years after start_year
    pass


def main():
    start_year = int(input("Enter a starting year: "))
    leap_years = next_20_leap_years(start_year)
    print("Next 20 leap years:")
    for year in leap_years:
        print(year)


if __name__ == "__main__":
    main()