from django.db import models


class January(models.Model):
    firstname = models.CharField(max_length=15)
    Monthly_shears = models.IntegerField(null=True)
    Installment = models.IntegerField(null=True)
    Outstanding_Loan = models.IntegerField(null=True)
    Loan_distrinute = models.IntegerField(null=True)
    Last_month_shears = models.IntegerField(null=True)

    def __str__(self):
        return f"{self.firstname}"


class February(models.Model):
    firstname = models.CharField(max_length=15)
    Monthly_shears = models.IntegerField(null=True)
    Installment = models.IntegerField(null=True)
    Outstanding_Loan = models.IntegerField(null=True)
    Loan_distrinute = models.IntegerField(null=True)
    Last_month_shears = models.IntegerField(null=True)

    def __str__(self):
        return f"{self.firstname}"
    
class March(models.Model):
    firstname = models.CharField(max_length=15)
    Monthly_shears = models.IntegerField(null=True)
    Installment = models.IntegerField(null=True)
    Outstanding_Loan = models.IntegerField(null=True)
    Loan_distrinute = models.IntegerField(null=True)
    Last_month_shears = models.IntegerField(null=True)

    def __str__(self):
        return f"{self.firstname}"


class April(models.Model):
    firstname = models.CharField(max_length=15)
    Monthly_shears = models.IntegerField(null=True)
    Installment = models.IntegerField(null=True)
    Outstanding_Loan = models.IntegerField(null=True)
    Loan_distrinute = models.IntegerField(null=True)
    Last_month_shears = models.IntegerField(null=True)

    def __str__(self):
        return f"{self.firstname}"


class May(models.Model):
    firstname = models.CharField(max_length=15)
    Monthly_shears = models.IntegerField(null=True)
    Installment = models.IntegerField(null=True)
    Outstanding_Loan = models.IntegerField(null=True)
    Loan_distrinute = models.IntegerField(null=True)
    Last_month_shears = models.IntegerField(null=True)

    def __str__(self):
        return f"{self.firstname}"


class June(models.Model):
    firstname = models.CharField(max_length=15)
    Monthly_shears = models.IntegerField(null=True)
    Installment = models.IntegerField(null=True)
    Outstanding_Loan = models.IntegerField(null=True)
    Loan_distrinute = models.IntegerField(null=True)
    Last_month_shears = models.IntegerField(null=True)

    def __str__(self):
        return f"{self.firstname}"


class July(models.Model):
    firstname = models.CharField(max_length=15)
    Monthly_shears = models.IntegerField(null=True)
    Installment = models.IntegerField(null=True)
    Outstanding_Loan = models.IntegerField(null=True)
    Loan_distrinute = models.IntegerField(null=True)
    Last_month_shears = models.IntegerField(null=True)

    def __str__(self):
        return f"{self.firstname}"


class August(models.Model):
    firstname = models.CharField(max_length=15)
    Monthly_shears = models.IntegerField(null=True)
    Installment = models.IntegerField(null=True)
    Outstanding_Loan = models.IntegerField(null=True)
    Loan_distrinute = models.IntegerField(null=True)
    Last_month_shears = models.IntegerField(null=True)

    def __str__(self):
        return f"{self.firstname}"


class September(models.Model):
    firstname = models.CharField(max_length=15)
    Monthly_shears = models.IntegerField(null=True)
    Installment = models.IntegerField(null=True)
    Outstanding_Loan = models.IntegerField(null=True)
    Loan_distrinute = models.IntegerField(null=True)
    Last_month_shears = models.IntegerField(null=True)

    def __str__(self):
        return f"{self.firstname}"


class October(models.Model):
    firstname = models.CharField(max_length=15)
    Monthly_shears = models.IntegerField(null=True)
    Installment = models.IntegerField(null=True)
    Outstanding_Loan = models.IntegerField(null=True)
    Loan_distrinute = models.IntegerField(null=True)
    Last_month_shears = models.IntegerField(null=True)

    def __str__(self):
        return f"{self.firstname}"


class November(models.Model):
    firstname = models.CharField(max_length=15)
    Monthly_shears = models.IntegerField(null=True)
    Installment = models.IntegerField(null=True)
    Outstanding_Loan = models.IntegerField(null=True)
    Loan_distrinute = models.IntegerField(null=True)
    Last_month_shears = models.IntegerField(null=True)

    def __str__(self):
        return f"{self.firstname}"


class December(models.Model):
    firstname = models.CharField(max_length=15)
    Monthly_shears = models.IntegerField(null=True)
    Installment = models.IntegerField(null=True)
    Outstanding_Loan = models.IntegerField(null=True)
    Loan_distrinute = models.IntegerField(null=True)
    Last_month_shears = models.IntegerField(null=True)

    def __str__(self):
        return f"{self.firstname}"
