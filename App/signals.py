from psutil import users

from App.models import January, February, March, April, May, June, July, August, September, October, November, December
from django.contrib.auth.models import User
users =  User.objects.all()

# for user in users :
#         if not January.objects.filter(firstname=user).exists():
#             January.objects.create(firstname=user.first_name,Last_month_shears=0).save()
#         else:
#             break
#
# for user in users:
#     if not February.objects.filter(firstname=user).exists():
#         February.objects.create(firstname=user.first_name).save()
#     else:
#         break
#
# for user in users:
#     if not March.objects.filter(firstname=user).exists():
#         March.objects.create(firstname=user.first_name).save()
#     else:
#         break
#
# for user in users:
#     if not April.objects.filter(firstname=user).exists():
#         April.objects.create(firstname=user.first_name).save()
#     else:
#         break
#
# for user in users:
#     if not May.objects.filter(firstname=user).exists():
#         May.objects.create(firstname=user.first_name).save()
#     else:
#         break
#
# for user in users:
#     if not June.objects.filter(firstname=user).exists():
#         June.objects.create(firstname=user.first_name).save()
#     else:
#         break
#
# for user in users:
#     if not July.objects.filter(firstname=user).exists():
#         July.objects.create(firstname=user.first_name).save()
#     else:
#         break
#
# for user in users:
#     if not August.objects.filter(firstname=user).exists():
#         August.objects.create(firstname=user.first_name).save()
#     else:
#         break
#
# for user in users:
#     if not September.objects.filter(firstname=user).exists():
#         September.objects.create(firstname=user.first_name).save()
#     else:
#         break
#
# for user in users:
#     if not October.objects.filter(firstname=user).exists():
#         October.objects.create(firstname=user.first_name).save()
#     else:
#         break
#
#
# for user in users:
#     if not November.objects.filter(firstname=user).exists():
#         November.objects.create(firstname=user.first_name).save()
#     else:
#         break
#
#
# for user in users:
#     if not December.objects.filter(firstname=user).exists():
#         December.objects.create(firstname=user.first_name).save()
#     else:
#         break
