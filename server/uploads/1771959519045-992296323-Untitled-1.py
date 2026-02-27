def is_leap(year):
    # Leap year rule:
    # 1. Divisible by 4
    # 2. Not divisible by 100 unless also divisible by 400
    return (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0)


def next_20_leap_years(start_year):
    leap_years = []
    year = start_year + 1

    while len(leap_years) < 20:
        if is_leap(year):
            leap_years.append(year)
        year += 1

    return leap_years


def main():
    start_year = int(input("Enter a starting year: "))
    leap_years = next_20_leap_years(start_year)
    print("Next 20 leap years:")
    for year in leap_years:
        print(year)


if __name__ == "__main__":
    main()