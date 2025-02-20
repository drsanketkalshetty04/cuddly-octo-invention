from django.contrib import admin
from django.contrib.auth.models import User
from App.models import January, February, March, April, May, June, July, August, September, October, November, December



class Jan(admin.ModelAdmin):
    list_display = ["firstname", "Monthly_shears", "Installment", "Outstanding_Loan"]


class Feb(admin.ModelAdmin):
    list_display = ["firstname", "Monthly_shears", "Installment", "Outstanding_Loan"]


class Mar(admin.ModelAdmin):
    list_display = ["firstname", "Monthly_shears", "Installment", "Outstanding_Loan"]


class Apr(admin.ModelAdmin):
    list_display = ["firstname", "Monthly_shears", "Installment", "Outstanding_Loan"]


class Mai(admin.ModelAdmin):
    list_display = ["firstname", "Monthly_shears", "Installment", "Outstanding_Loan"]


class Jun(admin.ModelAdmin):
    list_display = ["firstname", "Monthly_shears", "Installment", "Outstanding_Loan"]


class Jule(admin.ModelAdmin):
    list_display = ["firstname", "Monthly_shears", "Installment", "Outstanding_Loan"]


class Aug(admin.ModelAdmin):
    list_display = ["firstname", "Monthly_shears", "Installment", "Outstanding_Loan"]


class Sep(admin.ModelAdmin):
    list_display = ["firstname", "Monthly_shears", "Installment", "Outstanding_Loan"]


class Oct(admin.ModelAdmin):
    list_display = ["firstname", "Monthly_shears", "Installment", "Outstanding_Loan"]


class Nov(admin.ModelAdmin):
    list_display = ["firstname", "Monthly_shears", "Installment", "Outstanding_Loan"]


class Dec(admin.ModelAdmin):
    list_display = ["firstname", "Monthly_shears", "Installment", "Outstanding_Loan"]


admin.site.register(January, Jan)
admin.site.register(February, Feb)
admin.site.register(March, Mar)
admin.site.register(April, Apr)
admin.site.register(May, Mai)
admin.site.register(June, Jun)
admin.site.register(July, Jule)
admin.site.register(August, Aug)
admin.site.register(September, Sep)
admin.site.register(October, Oct)
admin.site.register(November, Nov)
admin.site.register(December, Dec)

